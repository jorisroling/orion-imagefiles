Package.describe({
	name: 'jorisroling:orion-imagefiles',
	summary: 'ImageFiles in Orion',
	version: '1.0.76',
	git: 'https://github.com/jorisroling/orion-imagefiles'
});

Package.onUse(function(api) {
	api.versionsFrom('1.3');
	api.use([
		'meteor-platform', 
		'http@1.2.9',
		'less@2.7.9',
		'ecmascript@0.8.2',
		'orionjs:core@1.8.1',
		'orionjs:accounts@1.8.1',
		'nicolaslopezj:roles@2.6.4',
		'raix:handlebar-helpers@0.2.5',
		'jorisroling:yves@1.0.47',
		'momentjs:moment@2.18.1',
		'tmeasday:publish-counts@0.8.0',
    'meteorhacks:picker@1.0.3',
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
		"request": "2.83.0",
		"easyimage": "2.1.0",
		"tmp": "0.0.33",
		"gridfs-locks":"1.3.4",
		"gridfs-locking-stream": "1.1.1",
		"object-hash": "1.1.8",
		"image-type": "3.0.0",
		"image-size":"0.6.1",
		"async":"2.6.0",
		'file-type':'6.1.0',
	});

	api.addAssets('loading.gif','client')
	
	api.export('ImageFiles','server');
	api.export('ImageFilesCollection','server');
});
