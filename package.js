Package.describe({
	name: 'jorisroling:orion-imagefiles',
	summary: 'ImageFiles in Orion',
	version: '1.0.62',
	git: 'https://github.com/jorisroling/orion-imagefiles'
});

Package.onUse(function(api) {
	api.versionsFrom('1.3');
	api.use([
		'meteor-platform', 
		'http@1.1.5',
		'less@2.6.0',
		'ecmascript@0.4.3',
		'orionjs:core@1.8.0',
		'orionjs:accounts@1.8.1',
		'nicolaslopezj:roles@2.2.0',
		'raix:handlebar-helpers@0.2.5',
		'jorisroling:eyes@0.0.15',
		'momentjs:moment@2.13.1',
		'tmeasday:publish-counts@0.7.3',
	]);

	api.use(['orionjs:bootstrap@1.8.0'], 'client', { weak: true });
	
	api.use([
		'jorisroling:isotope@1.0.14',
		'mizzao:bootboxjs@4.4.0',
		'tsega:bootstrap3-lightbox@0.2.0',
	], 'client');

	api.addFiles('imagefiles.js');
	api.addFiles('imagefiles_server.js', 'server');
	api.addFiles(['imagefiles_bootstrap.html','imagefiles_client.js','imagefiles.less'], 'client');

	Npm.depends({
		"request": "2.72.0",
		"easyimage": "2.1.0",
		"tmp": "0.0.28",
		"gridfs-locks":"1.3.4",
		"gridfs-locking-stream": "1.1.0",
		"object-hash": "1.1.2",
		"image-type": "2.1.0",
		"image-size":"0.5.0",
		"async":"1.5.2",
		'file-type':'3.8.0',
	});

	api.addAssets('loading.gif','client')
	
	api.export('ImageFiles','server');
	api.export('ImageFilesCollection','server');
});
