var debug=false;
Meteor.startup(function() {
	ImageFiles._ensureIndex({'filename':'text','metadata.original':'text','metadata.title':'text','metadata.description':'text'},{unique:false,background: true});
});

Meteor.publish('image.files', function(limit, search) {
	
	if (Roles.userHasRole(this.userId,'admin')) {
		var selector = {};
		if (debug) eyes({limit,search});
		if (limit) check(limit, Number);
		if (search) check(search, String);
		// Assign safe values to a new object after they have been validated
		// selector.name = query.name;
		if (search && search.length) selector.$text = {$search:search};

		Counts.publish(this,'image.files',ImageFiles.find(selector), { noReady: true });
	 

		var result=ImageFiles.find(selector, {
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

		let options={
			_id: new MongoInternals.NpmModule.ObjectID(id)
		};

		var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);

		gfs.remove(options, function (err, result) {
		  if (err) { eyes({err}) }
		  if (result) {
		    if (debug) eyes('remove success');
		  } else {
		    if (debug) eyes('remove failed');  // Due to failure to get a write lock
		  }
		});
		
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

function preProcess(id,derivate,request,response,callback)
{
	var result={};
	if (debug) eyes({request:request.headers});

	if (derivate) result.derivate=derivate;
	if (request.query.url) result.link=unescape(request.query.url);
	if (request.query.title) result.title=request.query.title;
	if (request.query.description) result.description=request.query.description;

	if (request.query.variant) {
		if (debug) eyes('variant!');
		let variant=Mongo.Collection.get('variants').find({_id:id},{limit:1}).fetch();
		if (variant && variant.length) {
			variant=variant[0];
			if (variant.images && variant.images.length) result.link=variant.images[0];
			if (variant.name) result.title=variant.name;
			if (variant.description) result.description=variant.description;
			result.variant={id:variant._id,brand:variant.brand,aggregator:variant.aggregator,merchant:variant.merchant,section:variant.section,ean:variant.ean};
			
			if (debug) eyes({variant});
			if (debug) eyes({result});
			callback(null,result);
		} else {
			callback(new Error('Variant not found'));
		}
	} else {
		if (id) result.id=id;
		callback(null,result);
	}
}


function pipeCachedFile(id,derivate,request,response,callback)
{
	preProcess(id,derivate,request,response,function(err,result) {
		if (err) throw err;
		if (result) {
			var cache=(request.query.cache==='false'?false:(request.headers['cache-control']==='no-cache'?false:true));
			if (debug) eyes({cache});

			if (cache) {
				// if (!cache) return callback();
	
				// ImageFiles
				// var Files=Mongo.Collection.get(gridCollection+'.files');
				// if (!Files) Files=new Meteor.Collection(gridCollection+'.files');
	
	
				var query;
	
				if (result.id && result.id.length) {
					if (debug) eyes({id:result.id});
					query={'_id':new MongoInternals.NpmModule.ObjectID(result.id)};
				} else {
					query={'metadata.original':unescape(result.link)};
					query['metadata.kind']=result.derivate?'derivate':'original';
					if (result.derivate && result.derivate.hash) query['metadata.derivate.hash']=result.derivate.hash;
				}
	
				if (debug) eyes({query});
				var imageFiles=ImageFiles.find(query,{limit:1}).fetch();
			}
			if (cache && imageFiles && imageFiles[0]) {
		
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
		
				gfs.createReadStream(options, function (error, readstream) {
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
				});
			} else {
				callback(null,result)
			}
		}
	})
}

RouterLayer.ironRouter.route('/image/:id?', function() {
	let self=this;
	var cache=(self.request.query.cache==='false'?false:(self.request.headers['cache-control']==='no-cache'?false:true));

	// if (debug) console.log( MongoInternals.defaultRemoteCollectionDriver().mongo);

	// if (debug) eyes(self.request.query.url)
	if (self.request.query.url || this.params.id) {
		
		pipeCachedFile(this.params.id,null,self.request,self.response,function(err,myData) {
			if (err) {
				throw err;
			} else if (myData && myData.done) {
				if (debug) eyes(myData);
			} else {
				if (debug) eyes(myData);
				if (debug) eyes('request');
				return request({uri:myData.link,encoding:'binary'}, function(error, response, body) {
					if (error) throw error;
					if (debug) eyes({response:response.headers});

					if (body) {
						// eyes({body});
						var imageData=new Buffer(body,'binary');
						try {

							var dim = imageSize(imageData);
							if (debug) eyes({dim});
							var type = imageType(imageData);
							if (debug) eyes({type});

							// var imageData=new Buffer(file.toString(),'binary');

							if (debug) console.log('File out read.')

							if (err) throw err


							var jid=new MongoInternals.NpmModule.ObjectID();
							var urlParse=url.parse(myData.link);
							// if (debug) eyes({urlParse});

							// var pathParse=path.parse(urlParse.pathname);
							var baseName=path.basename(urlParse.pathname);
							// if (debug) eyes({pathParse});
							if (cache) {
								var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);
					
								var options={
									_id:jid,
									filename: baseName,
									mode: 'w',
									chunkSize: 1024,
									content_type: type.mime,
									root: gridCollection,
									metadata: {
										width:dim.width,
										height:dim.height,
										kind:'original',
										original:myData.link,
										hash:hash(myData.link),
									},
									aliases: []
								}
								for (var k in myData) options.metadata[k]=myData[k];
								if (!options.metadata.title) options.metadata.title=baseName.replace(/[a-f0-9]{32,32}/gi,'').replace(/[0-9]{5,32}/g,'').replace(/[-_\.]+/g,' ').replace(/(jpg|jpeg|png|gif)$/i,' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();})
									
								gfs.createWriteStream(options, function (error, writestream) {
									if (writestream) {
									    writestream.on('finish', function() {
											if (debug) eyes({id:jid.toHexString(),finish:myData.link});
									    });

										var bufferStream = new stream.PassThrough();
										bufferStream.end( imageData );
										bufferStream.pipe(writestream);

									} else {
										// Stream couldn't be created because a write lock was not available
									}
								});
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
					}
				})
			}
		})
	}
}, {where: 'server'});


RouterLayer.ironRouter.route('/derivate/:id?', function() {
	let self=this;
	var cache=(self.request.query.cache==='false'?false:(self.request.headers['cache-control']==='no-cache'?false:true));
	

	// if (debug) console.log( MongoInternals.defaultRemoteCollectionDriver().mongo);

	// if (debug) eyes(self.request.query.url)
	if (self.request.query.url || this.params.id) {
		
		var derivate={method:self.request.query.method};
		derivate.options={}
		for (let k in self.request.query) {
			if (k!='url' && k!='method' && k!='cache') {
				derivate.options[k]=(/^[\d]+$/.test(self.request.query[k])?parseInt(self.request.query[k]):(/^[\d.]+$/.test(self.request.query[k])?parseFloat(self.request.query[k]):((self.request.query[k]==='true')?true:(self.request.query[k]=='false'?false:self.request.query[k]))));
			}
		}
		// derivate.options={
		// 	width:100, height:100,
		// 	x:0,y:0,
		// }
		derivate.hash=hash(derivate);
		if (debug) eyes({derivate});
		pipeCachedFile(this.params.id,derivate,self.request,self.response,function(err,myData) {
			if (err) {
				throw err;
			} else if (myData && myData.done) {
				if (debug) eyes(myData);
			} else {
				if (debug) eyes('request');
				return request({uri:myData.link,encoding:'binary'}, function(error, response, body) {
					if (error) throw error;
					if (body) {
						// var imageData=new Buffer(body,'binary');
						if (debug) eyes({headers:response.headers});

						tmp.file(function _tempFileCreated(err, inpath, infd, cleanupInTmpCallback) {
							if (debug) console.log('File in: ', inpath);
							if (debug) console.log('Filedescriptor in: ', infd);
							tmp.file(function _tempFileCreated(err, outpath, outfd, cleanupOutTmpCallback) {
								if (err) throw err;

								if (debug) console.log('File out: ', outpath);
								if (debug) console.log('Filedescriptor out: ', outfd);

						        fs.writeFile(inpath,body, 'binary', function(err){
						            if (err) throw err
						            if (debug) console.log('File in saved.')

									var opts={
										src:inpath,
										dst:outpath,
									}
								
									easyimg[derivate.method](_.extend(opts,derivate.options)).then(
										function(image) {
											if (debug) eyes({image});
											if (debug) console.log('Resized and cropped: ' + image.width + ' x ' + image.height);
											// if (debug) eyes(response.statusCode);
											// if (debug) eyes(response.headers);
											if (!error && response && response.statusCode == 200) {
												fs.readFile(outpath, 'binary', function (err, file) {

													var imageData=new Buffer(file.toString(),'binary');

													if (debug) console.log('File out read.')

													if (err) throw err


													var jid=new MongoInternals.NpmModule.ObjectID();
													var urlParse=url.parse(myData.link);
													// if (debug) eyes({urlParse});

													// var pathParse=path.parse(urlParse.pathname);
													var baseName=path.basename(urlParse.pathname);
													// if (debug) eyes({pathParse});
												
													if (cache) {
														var gfs = Grid(MongoInternals.defaultRemoteCollectionDriver().mongo.db, MongoInternals.NpmModule,gridCollection);
												
														var options={
															_id:jid,
															filename: baseName,
															mode: 'w',
															chunkSize: 1024,
															content_type: 'image/'+image.type,
															root: gridCollection,
															metadata: {
																width:image.width,
																height:image.height,
																kind:'derivate',
																original:myData.link,
																hash:hash(myData.link),
																derivate,
															},
															aliases: []
														}
														for (var k in myData) options.metadata[k]=myData[k];
														if (!options.metadata.title) options.metadata.title=baseName.replace(/[a-f0-9]{32,32}/i,'').replace(/[-_\.]+/g,' ').replace(/(jpg|jpeg|png|gif)$/i,' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();})
														gfs.createWriteStream(options, function (error, writestream) {
															if (writestream) {
															    writestream.on('finish', function() {
																	if (debug) eyes({id:jid.toHexString(),finish:myData.link});
															    });

																var bufferStream = new stream.PassThrough();
																bufferStream.end( imageData );
																bufferStream.pipe(writestream);

															} else {
																// Stream couldn't be created because a write lock was not available
															}
														});
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

												});
											} else {
												self.response.writeHead(302,{'Location':'/img/notfound.png'});
												self.response.end();
											}
										},
										function (err) {
											console.log(err);
										}
									);


								})
					        })
						})
					}
						

				})
			}
		})
	}
}, {where: 'server'});
