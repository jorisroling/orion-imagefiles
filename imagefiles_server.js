ImageFiles={collection:'image.files'}



var debug=false;


Meteor.startup(function() {
	// ImageFilesCollection._ensureIndex({'filename':'text','metadata.original':'text','metadata.title':'text','metadata.description':'text'},{unique:false,background: true});
	try {
		ImageFilesCollection._ensureIndex({'uploadDate':-1},{unique:false,background: true});
		ImageFilesCollection._ensureIndex({'metadata.original':1,'metadata.kind':1,'metadata.derivate.hash':1},{unique:false,background: true});
		ImageFilesCollection._ensureIndex({'$**':'text','uploadDate':-1},{unique:false,background: true});
	} catch (e) {
		console.log({exception:e});
	}
	
});

Meteor.publish(ImageFiles.collection, function(limit, search) {
	
	if (Roles.userHasRole(this.userId,'admin')) {
		var selector = {};
		if (debug) eyes({limit,search});
		if (limit) check(limit, Number);
		if (search) check(search, String);
		// Assign safe values to a new object after they have been validated
		// selector.name = query.name;
		if (search && search.length) selector.$text = {$search:search};

		Counts.publish(this,ImageFiles.collection,ImageFilesCollection.find(selector,{disableOplog:true,pollingIntervalMs:10*1000,pollingThrottleMs:50}), { noReady: true });
	 

		var result=ImageFilesCollection.find(selector, {
			limit: limit || 20,
			// Using sort here is necessary to continue to use the Oplog Observe Driver!
			// https://github.com/meteor/meteor/wiki/Oplog-Observe-Driver
			sort: {
				uploadDate: -1,
				// name:1
			}
		});
		if (debug) eyes({limit,selector,imagefiles:result.count()});
		
		return result;
	}
});

var Grid = Npm.require('gridfs-locking-stream');

// In your server code: define a method that the client can call
Meteor.methods({
	removeImageFile: function (id) {
		check([id], [String]);

		// Let other method calls from the same client start running,
		// without waiting for the email sending to complete.
		this.unblock();

		if(debug) eyes({remove:id});
		let options={
			_id: new MongoInternals.NpmModule.ObjectID(id)
		};

		var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);

		gfs.remove(options,Meteor.bindEnvironment(function (err, result) {
			if (err) { eyes({err}) }
			if (result) {
				if (debug) eyes('remove success');
			} else {
				eyes('ImageFile remove failed on id: '+id);	// Due to failure to get a write lock
			}
		}));
		
		if (debug) eyes({id});
	},
});




let request = Npm.require('request');
let easyimg = Npm.require('easyimage');
let tmp = Npm.require('tmp');
let fs = Npm.require('fs');

var Grid = Npm.require('gridfs-locking-stream');
var gridCollection='image';
var url=Npm.require('url');
var path=Npm.require('path');
var crypto = Npm.require('crypto');
var stream = Npm.require('stream');
var hash = Npm.require('object-hash');
var async = Npm.require('async');

var imageSize = Npm.require('image-size');
var imageType = Npm.require('image-type');

/*
easyimg.info(<image_path>) - to retrieve information about an image. Will return an object with the following properties - type, depth, width, height, size, density, name, and path.
easyimg.convert(<options>) - to convert an image from one format to another.
easyimg.resize(<options>) - to resize an image.
easyimg.crop(<options>) - to crop an image.
easyimg.thumbnail(<options>) - to create square thumbnails.
easyimg.rescrop(<options>) - to resize and crop and image in one go, useful for creating customzied thumbnails.
easyimg.rotate(<options>) - to rotate an image.
easyimg.exec(<command>) - when you want to call a custom command to ImageMagick, you will need to take care of escaping special characters etc.

OPTIONS

src - path to source image.
dst - path to destination image.
width - width of resized image.
height - height of resized image.
degree - degree of rotation.
cropwidth - width of cropped image, if missing, width will be used instead.
cropheight - height of cropped image, if missing, height will be used instead.
x - x offset for cropping, defaults to 0.
y - y offset for cropping, defaults to 0.
quality - quality of processed image, 1 to 100.
gravity - crop position [NorthWest | North | NorthEast | West | Center | East | SouthWest | South | SouthEast], defaults to Center.
fill - fill area flag, image is resized to completely fill the target crop dimensions, defaults to false.
background - background color, defaults to "white". If specified, automatically flattens the image.
flatten - if present, the image will be flattened (flattening removes alpha channel). Defaults to false.
ignoreAspectRatio - if set to true, resize will ignore aspect ratio


EXAMPLE

http://localhost.charlesproxy.com:8000/image?url=http://slodive.com/wp-content/uploads/2012/05/marilyn-monroe-pictures/marilyn-monroe-roxbury.jpg

http://localhost.charlesproxy.com:8000/derivate?url=http://slodive.com/wp-content/uploads/2012/05/marilyn-monroe-pictures/marilyn-monroe-roxbury.jpg&method=thumbnail&width=100&height=100&x=0&y=0

*/																

ImageFiles.collectionHandlers={};

ImageFiles.registerCollection=function(collection,handler) {
	if (typeof collection=="string" && collection.length && typeof handler=="function") ImageFiles.collectionHandlers[collection]=handler;
}

function preProcess(collection,id,method,width,height,request,callback)
{
	var result={};
	if (debug) eyes({request:request.headers});
	result.cache=(request.query.cache==='false'?false:(request.headers['cache-control']==='no-cache'?false:true));

	if (method || request.query.method || request.query.derivate) {
		var derivate={method:method || request.query.method || request.query.derivate};
		derivate.options={}
		if (width) derivate.options.width=parseInt(width);
		if (width) derivate.options.height=parseInt(width);
		if (height) derivate.options.height=parseInt(height);
		for (let k in request.query) {
			if (k!='url' && k!='method' && k!='derivate' && k!='cache') {
				derivate.options[k]=(/^[\d]+$/.test(request.query[k])?parseInt(request.query[k]):(/^[\d.]+$/.test(request.query[k])?parseFloat(request.query[k]):((request.query[k]==='true')?true:(request.query[k]=='false'?false:request.query[k]))));
			}
		}
		derivate.hash=hash(derivate);
	
		if (debug) eyes({derivate});
		result.derivate=derivate;
	}
	
	if (request.query.url) result.link=unescape(request.query.url);
	if (request.query.title) result.title=request.query.title;
	if (request.query.description) result.description=request.query.description;

	if (collection && collection!=ImageFiles.collection) {
		if (ImageFiles.collectionHandlers[collection]) {
			ImageFiles.collectionHandlers[collection](id,function(err,res) {
				if (err) {
					callback(err)
				} else {
					result.collection=collection;
					if (res) for (var k in res) result[k]=res[k];
					if (result.derivate && result.derivate.hash) delete result.derivate.hash;
					if (result.derivate) result.derivate.hash=hash(result.derivate);
					
					let link=url.parse(result.link);
					
					if (!link.host && request.headers.host) link.host=request.headers.host;
					if (!link.host) link.host='localhost';
					if (!link.protocol && request.headers['x-forwarded-proto']) link.protocol=request.headers['x-forwarded-proto'];
					if (!link.protocol) link.protocol='http';
					
					result.link=url.format(link);
					
					callback(null,result);
				}
			});
		} else {
			callback(new Error('Unknown ImageFile collection: '+collection));
		}
	} else {
		if (id) {
			result.id=id;
			result.collection=ImageFiles.collection;
		}
		callback(null,result);
	}
}


function pipeCachedFile(myData,request,response,callback)
{
	if(debug) eyes({myData});
	if (myData) {
		if (myData.cache) {
			var query;

			if (myData.id && myData.id.length && myData.collection==ImageFiles.collection) {
				if (debug) eyes({id:myData.id});
				query={'_id':new MongoInternals.NpmModule.ObjectID(myData.id)};
			} else if (myData.link) {
				query={'metadata.original':unescape(myData.link)};
				query['metadata.kind']=myData.derivate?'derivate':'original';
				if (myData.derivate && myData.derivate.hash) query['metadata.derivate.hash']=myData.derivate.hash;
			} else {
				throw new Error('No clue how to return image');
			}

			if (debug) eyes({query});
			var imageFiles=ImageFilesCollection.find(query,{limit:1}).fetch();
		}
		if (myData.cache && imageFiles && imageFiles[0]) {
	
			if (imageFiles[0].md5 === request.headers['if-none-match']) {
						response.writeHead(304, {});
				response.end();
				return callback(null,{done:'not-modified-etag'})
			}
	
			let lastModified=moment(imageFiles[0].uploadDate).format('ddd, DD MMM YYYY HH:mm:ss')+' GMT';

			if (lastModified === request.headers['if-modified-since']) {
				response.writeHead(304, {});
				response.end();
				return callback(null,{done:'not-modified-date'})
			}
	
			// if (debug) eyes({imageFiles});
			let options={
				_id: new MongoInternals.NpmModule.ObjectID(imageFiles[0]._id.valueOf())//imageFiles[0]._id.valueOf(),
			};
			// if (debug) eyes({options});
			var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);
	
			gfs.createReadStream(options,Meteor.bindEnvironment(function (error, readstream) {
				if (error) {
					callback(error);
				} else {
					if (readstream) {
						// if (debug) eyes('pipe');
						// if (debug) eyes({readstream,response});
						var headers={
							// 'Content-Disposition': 'attachment;filename='+imageFiles[0].filename,
							'Server':'meteor',
							'Date':moment().format('ddd, DD MMM YYYY HH:mm:ss')+' CET',
							'Content-Type': imageFiles[0].contentType,
							'Content-Length': imageFiles[0].length,
							'Last-Modified':lastModified,
							'ETag':imageFiles[0].md5,
							// 'Expires':moment(imageFiles[0].uploadDate).format('ddd, DD MMM YYYY HH:mm:ss')+' GMT',
							'Expires':moment().add(1,'months').format('ddd, DD MMM YYYY HH:mm:ss')+' GMT',
							'Max-Age':60*60*24*30,
							'Cache-Control':'public; max-age=2678400',
								}
						if (debug) eyes({myresponse:headers});
						response.writeHead(200, headers);
						readstream.pipe(response);
						callback(null,{done:'streamt'})
					} else {
						// Stream couldn't be created because a read lock was not available
						callback(new Error('Stream couldn\'t be created because a read lock was not available'))
					}
				}
			}));
		} else {
			callback(null,myData)
		}
	}
}

ImageFiles.ensureImages=function(myList,callback) 
{
	try {
		async.map(myList,Meteor.bindEnvironment(function(myData, callback) {
			ImageFiles.ensureImage(myData,function(err,result) {
				callback(null,result);
			});
		}),callback);		
	} catch (e) {
		eyes({e});
		callback(new Error(e.message));
	}
}

ImageFiles.ensureImage=function(myData,callback) 
{
	try {
		var query;

		if (myData.id && myData.id.length && myData.collection==ImageFiles.collection) {
			if (debug) eyes({id:myData.id});
			query={'_id':new MongoInternals.NpmModule.ObjectID(myData.id)};
		} else if (myData.link) {
			query={'metadata.original':unescape(myData.link)};
			query['metadata.kind']=myData.derivate?'derivate':'original';
			if (myData.derivate && myData.derivate.hash) query['metadata.derivate.hash']=myData.derivate.hash;
		} else {
			callback(Error('No clue how to return image'));
		}

		if (debug) eyes({query});
		var imageFiles=ImageFilesCollection.find(query,{limit:1}).fetch();
		if (imageFiles && imageFiles[0]) {
			callback(null,imageFiles[0])
		} else {
			var urlParse=url.parse(myData.link);
			if (urlParse.hostname && urlParse.protocol) {
				return request({uri:myData.link,encoding:'binary'}, Meteor.bindEnvironment(function(error, response, body) {
					if (error) callback(error);
					if (debug) eyes({response:response.headers});

					if (body && response.statusCode==200) {
						// eyes({body});
						var imageData=new Buffer(body,'binary');
						try {
							var type=response.headers['content-type'];
							if (!type) {
								try {
									type = imageType(imageData);
									if (debug) eyes({type});
									type=type && type.mime;
								} catch (e) {
									eyes({e});
								}
							}
							var dim;
							try {
								dim = imageSize(imageData);
								if (debug) eyes({dim});
							} catch (e) {
								eyes({link:myData.link,type,e,body});
							}

							// var imageData=new Buffer(file.toString(),'binary');

							if (debug) console.log('File out read.')

							// if (err) throw err


							var fileID=new MongoInternals.NpmModule.ObjectID();
							// if (debug) eyes({urlParse});

							// var pathParse=path.parse(urlParse.pathname);
							var baseName=path.basename(urlParse.pathname);
							// if (debug) eyes({pathParse});

							var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);

							var options={
								_id:fileID,
								filename: baseName,
								mode: 'w',
								chunkSize: 1024,
								content_type: type,
								root: gridCollection,
								metadata: {
									width: dim && dim.width,
									height:dim && dim.height,
									kind:'original',
									original:myData.link,
									hash:hash(myData.link),
								},
								aliases: []
							}
							// if (dim && dim.width) options.metadata.width=dim.width;
							// if (dim && dim.height) options.metadata.height=dim.height;
			
							for (var k in myData) if (k!='link' && k!='cache') options.metadata[k]=myData[k];
							if (!options.metadata.name) options.metadata.name=baseName.replace(/[a-f0-9]{32,32}/gi,'').replace(/[0-9]{5,32}/g,'').replace(/[-_\.]+/g,' ').replace(/(jpg|jpeg|png|gif)$/i,' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();})
							if (!options.metadata.title) options.metadata.title=options.metadata.name;
						
				
							gfs.createWriteStream(options,Meteor.bindEnvironment(function (error, writestream) {
								if (writestream) {
									writestream.on('finish',Meteor.bindEnvironment(function() {
										if (debug) eyes({id:fileID.toHexString(),finish:myData.link});
								
										var imageFiles=ImageFilesCollection.find(query,{limit:1}).fetch();
										if (imageFiles && imageFiles[0]) {
											callback(null,imageFiles[0])
										} else {
											callback(new Error('Image should have been stored'));
										}
									}));

									var bufferStream = new stream.PassThrough();
									bufferStream.end( imageData );
									bufferStream.pipe(writestream);
								} else {
									// Stream couldn't be created because a write lock was not available
									callback(new Error('Stream couldn\'t be created because a write lock was not available'));
								}
							}));

						} catch (e) {
							eyes({e});
							callback(new Error(e.message));
						}
					} else {
						callback(new Error('No image'))
					}
				}))
			} else {
				callback(new Error('Image not found'))
			}
		}
	} catch (e) {
		eyes({e});
		callback(new Error(e.message));
	}
}

ImageFiles.routeOriginal=function(context,myData) {
	let self=context;
	try {
		if (self.request.query.url || self.params.id) {
		
			pipeCachedFile(myData,self.request,self.response,function(err,myData) {
				if (err) {
					throw err;
				} else if (myData && myData.done) {
					if (debug) eyes(myData);
				} else {
					if (debug) eyes(myData);
					if (debug) eyes('request');
					var urlParse=url.parse(myData.link);
					if (urlParse.hostname && urlParse.protocol) {
						return request({uri:myData.link,encoding:'binary'},Meteor.bindEnvironment(function(error, response, body) {
							if (error) throw error;
							if (debug) eyes({response:response.headers});

							if (body && response.statusCode==200) {
								// eyes({body});
								var imageData=new Buffer(body,'binary');
								try {
									var type=response.headers['content-type'];
									if (!type) {
										try {
											type = imageType(imageData);
											if (debug) eyes({type});
											type=type && type.mime;
										} catch (e) {
											eyes({e});
										}
									}

									var dim;
									try {
										dim = imageSize(imageData);
										if (debug) eyes({dim});
									} catch (e) {
										eyes({link:myData.link,type,e,body});
									}

									// var imageData=new Buffer(file.toString(),'binary');

									if (debug) console.log('File out read.')

									var fileID=new MongoInternals.NpmModule.ObjectID();
									// if (debug) eyes({urlParse});

									// var pathParse=path.parse(urlParse.pathname);
									var baseName=path.basename(urlParse.pathname);
									// if (debug) eyes({pathParse});
									if (myData.cache) {
										var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);
					
										var options={
											_id:fileID,
											filename: baseName,
											mode: 'w',
											chunkSize: 1024,
											content_type: type,
											root: gridCollection,
											metadata: {
												width: dim && dim.width,
												height:dim && dim.height,
												kind:'original',
												original:myData.link,
												hash:hash(myData.link),
											},
											aliases: []
										}
										// if (dim && dim.width) options.metadata.width=dim.width;
										// if (dim && dim.height) options.metadata.height=dim.height;
								
										for (var k in myData) if (k!='link' && k!='cache') options.metadata[k]=myData[k];
										if (!options.metadata.name) options.metadata.name=baseName.replace(/[a-f0-9]{32,32}/gi,'').replace(/[0-9]{5,32}/g,'').replace(/[-_\.]+/g,' ').replace(/(jpg|jpeg|png|gif)$/i,' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();})
										if (!options.metadata.title) options.metadata.title=options.metadata.name;
									
										gfs.createWriteStream(options,Meteor.bindEnvironment(function (error, writestream) {
											if (writestream) {
												writestream.on('finish', function() {
													if (debug) eyes({id:fileID.toHexString(),finish:myData.link});
												});

												var bufferStream = new stream.PassThrough();
												bufferStream.end( imageData );
												bufferStream.pipe(writestream);

											} else {
												// Stream couldn't be created because a write lock was not available
											}
										}));
									}

									// response.headers['Content-Length']=file.length;
									// if (debug) eyes(response.headers);
									// self.response.writeHead(response.statusCode,response.headers);
									var headers={
										// 'Content-Disposition': 'attachment;filename='+imageFiles[0].filename,
										'Server':'meteor',
										'Date':moment().format('ddd, DD MMM YYYY HH:mm:ss')+' CET',
										'Content-Type': response.headers['content-type'],
										'Content-Length': imageData.length,
										'Last-Modified':moment().format('ddd, DD MMM YYYY HH:mm:ss')+' GMT',
										'ETag':crypto.createHash('md5').update(imageData).digest('hex'), //imageFiles[0].md5,
										'Expires':moment().add(1,'months').format('ddd, DD MMM YYYY HH:mm:ss')+' GMT',
										'Max-Age':60*60*24*30,
										'Cache-Control':'public; max-age=2678400', // 1 month
									}
									if (debug) eyes({response:headers});
									self.response.writeHead(200,headers);
									self.response.write(imageData);
									self.response.end();

									if (debug) console.log('done.')
								} catch (e) {
									eyes({e});
								}
							} else {
								self.response.writeHead(response.statusCode,response.headers);
								if (body) self.response.write(body);
								self.response.end();
							}
						}))
					} else {
						self.response.writeHead(404,{});
						self.response.write("Not Found");
						self.response.end();
					}
				}
			})
		}
	} catch (e) {
		eyes({exception: e});
		self.response.writeHead(500,{});
		self.response.write("Internal Server Error");
		self.response.end();
	}
}


ImageFiles.routeDerivate=function(context,myData) {
	let self=context;
	try {
		if (self.request.query.url || self.params.id) {
		
			pipeCachedFile(myData,self.request,self.response,function(err,myData) {
				if (err) {
					throw err;
				} else if (myData && myData.done) {
					if (debug) eyes(myData);
				} else {
					if (debug) eyes('request');
					var urlParse=url.parse(myData.link);
					if (urlParse.hostname && urlParse.protocol) {
						return request({uri:myData.link,encoding:'binary'},Meteor.bindEnvironment(function(error, response, body) {
							if (error) throw error;
							if (body && response.statusCode==200) {
								// var imageData=new Buffer(body,'binary');
								if (debug) eyes({headers:response.headers});

								
								tmp.file(Meteor.bindEnvironment(function _tempFileCreated(err, inpath, infd, cleanupInTmpCallback) {
									if (debug) console.log('File in: ', inpath);
									if (debug) console.log('Filedescriptor in: ', infd);
									tmp.file(Meteor.bindEnvironment(function _tempFileCreated(err, outpath, outfd, cleanupOutTmpCallback) {
										if (err) throw err;

										if (debug) console.log('File out: ', outpath);
										if (debug) console.log('Filedescriptor out: ', outfd);

										fs.writeFile(inpath,body, 'binary',Meteor.bindEnvironment(function(err){
											if (err) throw err
											if (debug) console.log('File in saved.')

											var opts={
												src:inpath,
												dst:outpath,
											}
											// eyes({options:_.extend(opts,myData.derivate.options)})
											easyimg[myData.derivate.method](_.extend(opts,myData.derivate.options)).then(
												Meteor.bindEnvironment(function(image) {
													if (debug) eyes({image});
													if (debug) console.log('Resized and cropped: ' + image.width + ' x ' + image.height);
													// if (debug) eyes(response.statusCode);
													// if (debug) eyes(response.headers);
													if (!error && response && response.statusCode == 200) {
														fs.readFile((image.type=='mvg')?inpath:outpath, 'binary', Meteor.bindEnvironment(function (err, file) {

															var imageData=new Buffer(file.toString(),'binary');

															if (debug) console.log('File out read.')

															if (err) throw err


															var fileID=new MongoInternals.NpmModule.ObjectID();
															// if (debug) eyes({urlParse});

															// var pathParse=path.parse(urlParse.pathname);
															var baseName=path.basename(urlParse.pathname);
															// if (debug) eyes({pathParse});
												
															if (myData.cache) {
																var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);
												
																var options={
																	_id:fileID,
																	filename: baseName,
																	mode: 'w',
																	chunkSize: 1024,
																	content_type: (image.type=='mvg')?response.headers['response.headers']:('image/'+image.type),
																	root: gridCollection,
																	metadata: {
																		width:image.width,
																		height:image.height,
																		kind:'derivate',
																		original:myData.link,
																		hash:hash(myData.link),
																		derivate:myData.derivate,
																	},
																	aliases: []
																}
																// eyes({myData});
																for (var k in myData) if (k!='link' && k!='cache') options.metadata[k]=myData[k];
																if (!options.metadata.title) options.metadata.title=baseName.replace(/[a-f0-9]{32,32}/i,'').replace(/[-_\.]+/g,' ').replace(/(jpg|jpeg|png|gif)$/i,' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();})
																gfs.createWriteStream(options,Meteor.bindEnvironment(function (error, writestream) {
																	if (writestream) {
																			writestream.on('finish', function() {
																			if (debug) eyes({id:fileID.toHexString(),finish:myData.link});
																			});

																		var bufferStream = new stream.PassThrough();
																		bufferStream.end( imageData );
																		bufferStream.pipe(writestream);

																	} else {
																		// Stream couldn't be created because a write lock was not available
																	}
																}));
															}

															// response.headers['Content-Length']=file.length;
															// if (debug) eyes(response.headers);
															// self.response.writeHead(response.statusCode,response.headers);
															var headers={
																// 'Content-Disposition': 'attachment;filename='+imageFiles[0].filename,
																'Server':'meteor',
																'Date':moment().format('ddd, DD MMM YYYY HH:mm:ss')+' CET',
																'Content-Type': response.headers['content-type'],
																'Content-Length': file.length,
																'Last-Modified':moment().format('ddd, DD MMM YYYY HH:mm:ss')+' GMT',
																'ETag':crypto.createHash('md5').update(imageData).digest('hex'), //imageFiles[0].md5,
																'Expires':moment().add(1,'months').format('ddd, DD MMM YYYY HH:mm:ss')+' GMT',
																'Max-Age':60*60*24*30,
																'Cache-Control':'public; max-age=2678400', // 1 month
																	}
															if (debug) eyes({response:headers});
																	self.response.writeHead(200,headers);
															self.response.write(imageData);
																	self.response.end();

															cleanupInTmpCallback();
															cleanupOutTmpCallback();
															if (debug) console.log('done.')

														}));
													} else {
														self.response.writeHead(500,{});
														self.response.write("Internal Server Error");
														self.response.end();
														// self.response.writeHead(302,{'Location':'/img/notfound.png'});
														// self.response.end();
													}
												}),
												function (err) {
													// console.log(err);
													self.response.writeHead(404,{});
													self.response.write(err);
													self.response.end();
												}
											);
										}))
									}))
								}))
							} else {
								self.response.writeHead(response.statusCode,response.headers);
								if (body) self.response.write(body);
								self.response.end();
							}
						}))
					} else {
						self.response.writeHead(404,{});
						self.response.write("Not Found");
						self.response.end();
					}
				}
			})
		}
	} catch(e) {
		eyes({exception: e});
		self.response.writeHead(500,{});
		self.response.write("Internal Server Error");
		self.response.end();
	}
}

RouterLayer.ironRouter.route('/image/file/:id?/:method?/:width?/:height?', function() {
	var self=this;
	preProcess(ImageFiles.collection,self.params.id,self.params.method,self.params.width,self.params.height,self.request,function(err,myData) {
		if (err || !myData) {
			self.response.writeHead(404,{});
			self.response.write("Not Found");
			self.response.end();
		} else {
			if (myData && myData.derivate) {
				ImageFiles.routeDerivate(self,myData);
			} else {
				ImageFiles.routeOriginal(self,myData);
			}
		}
	});
}, {where: 'server'});

RouterLayer.ironRouter.route('/image/:collection?/:id?/:method?/:width?/:height?', function() {
	var self=this;
	preProcess(self.params.collection,self.params.id,self.params.method,self.params.width,self.params.height,self.request,function(err,myData) {
		if (err || !myData) {
			self.response.writeHead(404,{});
			self.response.write("Not Found");
			self.response.end();
		} else {
			if (myData.derivate) {
				ImageFiles.routeDerivate(self,myData);
			} else {
				ImageFiles.routeOriginal(self,myData);
			}
		}
	});
}, {where: 'server'});

ImageFiles.registerCollection('orion',function(id,callback) {
	var result={};
	
	// eyes({files:orion.filesystem.collection.find({},{}).fetch()});
	// eyes({id});

	let orionFile=orion.filesystem.collection.find({$or:[{_id:id},{'meta.gridFS_id':id}]},{limit:1}).fetch();
	if (orionFile && orionFile.length) {
		orionFile=orionFile[0];
		if (orionFile.url) result.link=orionFile.url;
		if (orionFile.name) result.title=orionFile.name;
		// result.file={};
		// eyes({result});
		// callback(null,result);
	} else {
		result.link='/gridfs/data/id/'+id;
		// callback(new Error('orionFile ID not found'));
	}
	callback(null,result);
})


