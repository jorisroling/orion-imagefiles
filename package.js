Package.describe({
  name: 'jorisroling:orion-imagefiles',
  summary: 'ImageFiles in Orion',
  version: '0.0.1',
  git: 'https://github.com/jorisroling/orion-imagefiles'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2');
  api.use(['meteor-platform', 'less@2.5.1','ecmascript@0.1.6','orionjs:base@1.6.0','nicolaslopezj:roles@2.0.0']);

  api.use(['orionjs:bootstrap@1.6.0'], 'client', { weak: true });
  
  api.use(['mizzao:bootboxjs@4.4.0'], 'client', { weak: true });
  api.use(['jorisroling:isotope@1.0.8'], 'client', { weak: true });
  api.use(['jorisroling:eyes@0.0.10'], 'client', { weak: true });
  

  api.addFiles('imagefiles.js');
  api.addFiles('imagefiles_server.js', 'server');
  api.addFiles(['imagefiles_bootstrap.html','imagefiles_client.js','imagefiles.less'], 'client');

  Npm.depends({
    "request": "2.69.0",
	"easyimage": "2.1.0",
	"tmp": "0.0.28",
    "gridfs-locking-stream": "1.1.0",
	"object-hash": "1.1.2",
    "image-type": "2.1.0",
	"image-size":"0.4.0",
  });


  
  // api.export('ImageFiles');
});
