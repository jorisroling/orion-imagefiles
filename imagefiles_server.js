ImageFiles={collection:'image.files'}

var debug = yves.debugger('image:files')
var verbose = false;

Meteor.startup(function() {
	// ImageFilesCollection._ensureIndex({'filename':'text','metadata.original':'text','metadata.title':'text','metadata.description':'text'},{unique:false,background: true});
	try {
		ImageFilesCollection._ensureIndex({'uploadDate':-1},{unique:false,background: true});
		ImageFilesCollection._ensureIndex({'metadata.original':1,'metadata.kind':1,'metadata.derivate.hash':1},{unique:false,background: true});
		ImageFilesCollection._ensureIndex({'$**':'text','uploadDate':-1},{unique:false,background: true});
	} catch (e) {
		console.error({exception:e});
	}
	
});

Meteor.publish(ImageFiles.collection, function(limit, search) {
	
	if (Roles.userHasRole(this.userId,'admin')) {
		var selector = {};
		debug('publish %y',{limit,search});
		if (limit) check(limit, Number);
		if (search) check(search, String);
		// Assign safe values to a new object after they have been validated
		// selector.name = query.name;
		if (search && search.length) selector.$text = {$search:search};

		Counts.publish(this,ImageFiles.collection,ImageFilesCollection.find(selector/*,{disableOplog:true,pollingIntervalMs:5*1000,pollingThrottleMs:50}*/), {noReady:true,nonReactive:true});

		var result=ImageFilesCollection.find(selector, {
			limit: limit || 20,
			// Using sort here is necessary to continue to use the Oplog Observe Driver!
			// https://github.com/meteor/meteor/wiki/Oplog-Observe-Driver
			sort: {
				uploadDate: -1,
				// name:1
			},
			// disableOplog:true,
			// pollingIntervalMs:5*1000,
			// pollingThrottleMs:50,
		});
		debug('publish %y',{limit,selector,imagefiles:result.count()});
		
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

		debug('removeImageFile %y',{remove:id});
		let options={
			_id: new MongoInternals.NpmModule.ObjectID(id)
		};

		var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);

		gfs.remove(options,Meteor.bindEnvironment(function (err, result) {
			if (err) { yves({err}) }
			if (result) {
				debug('removeImageFile %y','remove success');
			} else {
				console.error('ImageFile remove failed on id: '+id);	// Due to failure to get a write lock
			}
		}));
		
		debug('removeImageFile id: %y',{id});
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
// var sharp = Npm.require('sharp');

const fileType = require('file-type');
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
	debug('preProcess %y',{request:request.headers});
	result.cache=((request.query && request.query.cache==='false')?false:(request.headers['cache-control']==='no-cache'?false:true));

	if (method || (request.query && (request.query.method || request.query.derivate))) {
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
	
		debug('preProcess %y',{derivate});
		result.derivate=derivate;
	}

  if (!request.query && request.url) {
    let pos=request.url.indexOf('?');
    if (pos>=0) {
      let search = request.url.substr(pos+1)
      let query = search?JSON.parse('{"' + search.replace(/&/g, '","').replace(/=/g,'":"') + '"}',function(key, value) { return key===""?value:decodeURIComponent(value) }):{}
      if (query) {
        debug('preProcess %y',{query})
        request.query = query;
      }
    }
  }
	
  if (request.query) {
  	if (request.query.url) result.link=unescape(request.query.url);
  	if (request.query.title) result.title=request.query.title;
  	if (request.query.description) result.description=request.query.description;
  }

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
					
					if (!link.host || !link.protocol) result.original=result.link;
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
	debug('pipeCachedFile %y',{myData});
	if (myData) {
		if (myData.cache) {
			var query;
			if (myData.id && myData.id.length && myData.collection==ImageFiles.collection) {
				debug('pipeCachedFile %y',{id:myData.id});
        // query={'_id':new MongoInternals.NpmModule.ObjectID(myData.id)};
				query={'_id':new Meteor.Collection.ObjectID(myData.id)};
			} else if (myData.link) {
				query={'metadata.original':unescape(myData.original?myData.original:myData.link)};
				query['metadata.kind']=myData.derivate?'derivate':'original';
				if (myData.derivate && myData.derivate.hash) query['metadata.derivate.hash']=myData.derivate.hash;
			} else {
				throw new Error('No clue how to return image B');
			}

			debug('pipeCachedFile %y',{query});
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
	
			let options={
				_id: new MongoInternals.NpmModule.ObjectID(imageFiles[0]._id.valueOf())//imageFiles[0]._id.valueOf(),
			};
			var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);
	
			gfs.createReadStream(options,Meteor.bindEnvironment(function (error, readstream) {
				if (error) {
					callback(error);
				} else {
					if (readstream) {
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
						debug('pipeCachedFile %y',{myresponse:headers});
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
				return callback(null,result);
			});
		}),callback);		
	} catch (e) {
		yves({e});
		return callback(new Error(e.message));
	}
}

ImageFiles.ensureImage=function(myData,callback) 
{
	try {
		var query;

		if (myData.id && myData.id.length && myData.collection==ImageFiles.collection) {
			debug('ensureImage %y',{id:myData.id});
			query={'_id':new MongoInternals.NpmModule.ObjectID(myData.id)};
		} else if (myData.link) {
			query={'metadata.original':unescape(myData.original?myData.original:myData.link)};
			query['metadata.kind']=myData.derivate?'derivate':'original';
			if (myData.derivate && myData.derivate.hash) query['metadata.derivate.hash']=myData.derivate.hash;
		} else {
			return callback(Error('No clue how to return image A'));
		}

		debug('ensureImage %y',{query});
		var imageFiles=ImageFilesCollection.find(query,{limit:1}).fetch();
		if (imageFiles && imageFiles[0]) {
			return callback(null,imageFiles[0])
		} else {
			var urlParse=url.parse(myData.link);
			if (urlParse.hostname && urlParse.protocol) {
				return request({uri:myData.link,encoding:'binary'}, Meteor.bindEnvironment(function(error, response, body) {
					if (error) return callback(error);
					debug('ensureImage %y',{response:response.headers});

					if (body && response.statusCode==200) {
						// yves({body});
						var imageData=new Buffer(body,'binary');
						try {
							var type=response.headers['content-type'];
							if (!type) {
								try {
									type = imageType(imageData);
									debug('ensureImage %y',{type});
									type=type && type.mime;
								} catch (e) {
									yves({e});
								}
							}
							var dim;
							try {
								dim = imageSize(imageData);
								debug('ensureImage %y',{dim});
							} catch (e) {
								yves({link:myData.link,type,e});
							}

							// var imageData=new Buffer(file.toString(),'binary');

							if (verbose) console.log('File out read.')

							// if (err) throw err


							var fileID=new MongoInternals.NpmModule.ObjectID();
							// debug('ensureImage %y',{urlParse});

							// var pathParse=path.parse(urlParse.pathname);
							var baseName=path.basename(urlParse.pathname);
							// debug('ensureImage %y',{pathParse});

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
									original:myData.original?myData.original:myData.link,
									hash:hash(myData.original?myData.original:myData.link),
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
										debug('ensureImage %y',{id:fileID.toHexString(),finish:myData.link});
								
										var imageFiles=ImageFilesCollection.find(query,{limit:1}).fetch();
										if (imageFiles && imageFiles[0]) {
											return callback(null,imageFiles[0])
										} else {
											return callback(new Error('Image should have been stored'));
										}
									}));

									var bufferStream = new stream.PassThrough();
									bufferStream.end( imageData );
									bufferStream.pipe(writestream);
								} else {
									// Stream couldn't be created because a write lock was not available
									return callback(new Error('Stream couldn\'t be created because a write lock was not available'));
								}
							}));

						} catch (e) {
							yves({e});
							return callback(new Error(e.message));
						}
					} else {
						return callback(new Error('No image'))
					}
				}))
			} else {
				return callback(new Error('Image not found'))
			}
		}
	} catch (e) {
		yves({e});
		return callback(new Error(e.message));
	}
}

ImageFiles.routeOriginal=function(context,myData) {
	try {
		if ((context.request.query && context.request.query.url) || context.params.id) {
		
			pipeCachedFile(myData,context.request,context.response,function(err,myData) {
				if (err) {
					throw err;
				} else if (myData && myData.done) {
					debug('routeOriginal %y',myData);
				} else {
					debug('routeOriginal %y',myData);
					debug('routeOriginal %y','request');
					var urlParse=myData.link?url.parse(myData.link):null;
					if (urlParse && urlParse.hostname && urlParse.protocol) {
						return request({uri:myData.link,encoding:'binary'},Meteor.bindEnvironment(function(error, response, body) {
							if (error) throw error;
							debug('routeOriginal %y',{response:response.headers});

							if (body && response.statusCode==200) {
								// yves({body});
								var imageData=new Buffer(body,'binary');
								try {
									var type=response.headers['content-type'];
									if (!type) {
										try {
											type = imageType(imageData);
											debug('routeOriginal %y',{type});
											type=type && type.mime;
										} catch (e) {
											yves({e});
										}
									}

									var dim;
									try {
										dim = imageSize(imageData);
										debug('routeOriginal %y',{dim});
									} catch (e) {
										yves({link:myData.link,type,e});
									}

									// var imageData=new Buffer(file.toString(),'binary');

									if (verbose) console.log('File out read.')

									var fileID=new MongoInternals.NpmModule.ObjectID();
									// debug('routeOriginal %y',{urlParse});

									// var pathParse=path.parse(urlParse.pathname);
									var baseName=path.basename(urlParse.pathname);
									// debug('routeOriginal %y',{pathParse});
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
												original:myData.original?myData.original:myData.link,
												hash:hash(myData.original?myData.original:myData.link),
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
													debug('routeOriginal %y',{id:fileID.toHexString(),finish:myData.link});
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
									// debug('routeOriginal %y',response.headers);
									// context.response.writeHead(response.statusCode,response.headers);
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
									debug('routeOriginal %y',{response:headers});
									context.response.writeHead(200,headers);
									context.response.write(imageData);
									context.response.end();

									if (verbose) console.log('done.')
								} catch (e) {
									yves({e});
									context.response.writeHead(500,{});
									context.response.write("Internal Server Error");
									context.response.end();
								}
							} else {
								context.response.writeHead(response.statusCode,response.headers);
								if (body) context.response.write(body);
								context.response.end();
							}
						}))
					} else {
						context.response.writeHead(404,{});
						context.response.write("Not Found");
						context.response.end();
					}
				}
			})
		}
	} catch (e) {
		yves({exception: e});
		context.response.writeHead(500,{});
		context.response.write("Internal Server Error");
		context.response.end();
	}
}


ImageFiles.routeDerivate=function(context,myData) {
	try {
		if ((context.request.query && context.request.query.url) || context.params.id) {
		
			pipeCachedFile(myData,context.request,context.response,function(err,myData) {
				if (err) {
					throw err;
				} else if (myData && myData.done) {
					debug('routeDerivate %y',myData);
				} else {
					debug('routeDerivate %y','request');
					var urlParse=myData.link?url.parse(myData.link):null;
					if (urlParse && urlParse.hostname && urlParse.protocol) {
						return request({uri:myData.link,encoding:'binary'},Meteor.bindEnvironment(function(error, response, body) {
							if (error) throw error;
							if (body && response.statusCode==200) {
								
								var fimageData=new Buffer(body,'binary');
								let ftype=fileType(fimageData);
								if (!ftype || !ftype.mime || !ftype.mime.match(/^image\//)) {
  								debug('bad ftype %y',ftype);
                  // console.error('Could not establish correct image format');
									context.response.writeHead(301,{Location:myData.link});
									context.response.end();
									return;
								}
								
								debug('routeDerivate %y',{headers:response.headers});

								if (!/^image\//.test(response.headers['content-type']) || (ftype && ftype.mime === 'image/x-icon')) {
									context.response.writeHead(301,{Location:myData.link});
									context.response.end();
									return;
								}
								tmp.file(Meteor.bindEnvironment(function _tempFileCreated(err, inpath, infd, cleanupInTmpCallback) {
									if (verbose) console.log('File in: ', inpath);
									if (verbose) console.log('Filedescriptor in: ', infd);
									tmp.file(Meteor.bindEnvironment(function _tempFileCreated(err, outpath, outfd, cleanupOutTmpCallback) {
										if (err) throw err;

										if (verbose) console.log('File out: ', outpath);
										if (verbose) console.log('Filedescriptor out: ', outfd);

										fs.writeFile(inpath,body, 'binary',Meteor.bindEnvironment(function(err){
											if (err) throw err
											if (verbose) console.log('File in saved.')


											var opts={
												src:inpath,
												dst:((/^image\//.test(response.headers['content-type']))?'':'png:')+outpath,
												extra:[]
											}
                      function patchWidth(opts) {
                        // console.log({opts})
                        var ropts=_.extend({},opts)
                        if (ropts.hasOwnProperty('width') && !ropts.width) ropts.width=99999;
                        return ropts
                      }
                      // yves({options:_.extend(opts,myData.derivate.options)})
                      let prom
                      let sizer
                      // if (myData.derivate.method=='resize') {
                      //   debug('routeDerivate tool %y','sharp');
                      //   sizer='sharp'
                      //   prom=sharp(inpath).resize( myData.derivate.options.width ? myData.derivate.options.width : null, myData.derivate.options.height ? myData.derivate.options.height : null).toFile(outpath)
                      // } else {
                        sizer='easyimg' 
                        prom=easyimg[myData.derivate.method](patchWidth(_.extend(opts,myData.derivate.options)))
                      // }
											prom.then(
												Meteor.bindEnvironment(function(image) {
                          var image_type=(sizer=='sharp')?image.format:image.type;
													debug('routeDerivate %y',{image});
													if (verbose) console.log('Resized and cropped: ' + image.width + ' x ' + image.height);
													// debug('routeDerivate %y',response.statusCode);
													// debug('routeDerivate %y',response.headers);
													if (!error && response && response.statusCode == 200) {
														fs.readFile((image_type=='mvg')?inpath:outpath, 'binary', Meteor.bindEnvironment(function (err, file) {

															var imageData=new Buffer(file.toString(),'binary');

															if (verbose) console.log('File out read.')

															if (err) throw err


															var fileID=new MongoInternals.NpmModule.ObjectID();
															// debug('routeDerivate %y',{urlParse});

															// var pathParse=path.parse(urlParse.pathname);
															var baseName=path.basename(urlParse.pathname);
															// debug('routeDerivate %y',{pathParse});
												
															if (myData.cache) {
																var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);
												
																var options={
																	_id:fileID,
																	filename: baseName,
																	mode: 'w',
																	chunkSize: 1024,
																	content_type: (image_type=='mvg')?response.headers['content-type']:('image/'+image_type),
																	root: gridCollection,
																	metadata: {
																		width:image.width,
																		height:image.height,
																		kind:'derivate',
																		original:myData.original?myData.original:myData.link,
																		hash:hash(myData.original?myData.original:myData.link),
																		derivate:myData.derivate,
																	},
																	aliases: []
																}
																// yves({myData});
																for (var k in myData) if (k!='link' && k!='cache') options.metadata[k]=myData[k];
																if (!options.metadata.title) options.metadata.title=baseName.replace(/[a-f0-9]{32,32}/i,'').replace(/[-_\.]+/g,' ').replace(/(jpg|jpeg|png|gif)$/i,' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();})
																gfs.createWriteStream(options,Meteor.bindEnvironment(function (error, writestream) {
																	if (writestream) {
																			writestream.on('finish', function() {
																			debug('routeDerivate %y',{id:fileID.toHexString(),finish:myData.link});
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
															// debug('routeDerivate %y',response.headers);
															// context.response.writeHead(response.statusCode,response.headers);
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
															debug('routeDerivate %y',{response:headers});
																	context.response.writeHead(200,headers);
															context.response.write(imageData);
																	context.response.end();

															cleanupInTmpCallback();
															cleanupOutTmpCallback();
															if (verbose) console.log('done.')

														}));
													} else {
														context.response.writeHead(500,{});
														context.response.write("Internal Server Error");
														context.response.end();
														// context.response.writeHead(302,{'Location':'/img/notfound.png'});
														// context.response.end();
													}
												}),
												function (err) {
													// console.log(err);
													context.response.writeHead(404,{});
													context.response.write(err);
													context.response.end();
												}
											);
										}))
									}))
								}))
							} else {
								context.response.writeHead(response.statusCode,response.headers);
								if (body) context.response.write(body);
								context.response.end();
							}
						}))
					} else {
						context.response.writeHead(404,{});
						context.response.write("Not Found");
						context.response.end();
					}
				}
			})
		}
	} catch(e) {
		yves({exception: e});
		context.response.writeHead(500,{});
		context.response.write("Internal Server Error");
		context.response.end();
	}
}


ImageFiles.routeFile=function(context) {
	preProcess(ImageFiles.collection,context.params.id,context.params.method,context.params.width,context.params.height,context.request,function(err,myData) {
		if (err || !myData) {
			context.response.writeHead(404,{});
			context.response.write("Not Found");
			context.response.end();
		} else {
			if (myData && myData.derivate) {
				ImageFiles.routeDerivate(context,myData);
			} else {
				ImageFiles.routeOriginal(context,myData);
			}
		}
	});
}

if (RouterLayer && RouterLayer.ironRouter) {
  RouterLayer.ironRouter.route('/image/file/:id?/:method?/:width?/:height?', function() {
  	ImageFiles.routeFile(this);
  }, {where: 'server'})
} else {
  Picker.route('/image/file/:id?/:method?/:width?/:height?', function( params, request, response, next ) {
  	ImageFiles.routeFile({params: params, request: request, response: response, next: next});
  })
}

ImageFiles.routeCollection=function(context) {
	preProcess(context.params.collection,context.params.id,context.params.method,context.params.width,context.params.height,context.request,function(err,myData) {
		if (err || !myData) {
			context.response.writeHead(404,{});
			context.response.write("Not Found");
			context.response.end();
		} else {
			if (myData.derivate) {
				ImageFiles.routeDerivate(context,myData);
			} else {
				ImageFiles.routeOriginal(context,myData);
			}
		}
	});
}

if (RouterLayer && RouterLayer.ironRouter) {
  RouterLayer.ironRouter.route('/image/:collection?/:id?/:method?/:width?/:height?', function() {
	  ImageFiles.routeCollection(this)
  }, {where: 'server'});
} else {
  Picker.route('/image/:collection?/:id?/:method?/:width?/:height?', function( params, request, response, next ) {
	  ImageFiles.routeCollection({params: params, request: request, response: response, next: next})
  })
}


ImageFiles.registerCollection('orion',function(id,callback) {
	var result={};
	
	// yves({files:orion.filesystem.collection.find({},{}).fetch()});
	// yves({id});
  // debug('orion %y',{files:orion.filesystem.collection.find({},{}).fetch()});
  debug('orion %y',{id});
	let orionFile=orion.filesystem.collection.find({$or:[{_id:id},{'meta.gridFS_id':id}]},{limit:1}).fetch();
	if (orionFile && orionFile.length) {
		orionFile=orionFile[0];
		if (orionFile.url) result.link=orionFile.url;
		if (orionFile.name) result.title=orionFile.name;
		// result.file={};
		// yves({result});
		// callback(null,result);
	} else {
		result.link='/gridfs/data/id/'+id;
		// callback(new Error('orionFile ID not found'));
	}
	callback(null,result);
})


