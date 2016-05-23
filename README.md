#ImageFiles for Orion

This package give's an image cache for images originating from remote sites, aswell as the option to resize them on the fly. All images are stored in the MongoDB database (GridFS), and only retrieved from the remote site if the image does not exist in the database.

##To Install
```meteor add jorisroling:orion-imagefile```

##Extra

```meteor add twbs:bootstrap```  
```meteor add orionjs:bootstrap```  
```meteor add iron:router```  

The UI (in OrionJS) is depending on the Bootstrap CSS framework, so make sure you use one (of your choice). Further, OrionJS needs to know we want bootstrap, and a router of choice needs to be installed.

##Use with remote URL
By adressing your own server with the path '/image?url=<ORIGINAL URL>' For example:
```<img src="/image?url=https://goo.gl/tYtM9F"```

Mind you, you should make sure the URL passed is properly url encoded. Use ```encodeURIComponent()``` for this.
So the above example should probably read
```<img src="/image?url=https%3A%2F%2Fgoo.gl%2FtYtM9F"```

As an bonus you could resize the image on the fly by using the extra parameter 'derivate' with values like 'resize' or 'thumbnail'. See the [easyimage](https://github.com/hacksparrow/node-easyimage) packages for all possible values and options. An example would be:

```http://localhost:4000/image?url=https://goo.gl/tYtM9F&derivate=resize&width=30
##Use with Orion images
By using the URL scheme '/images/orion/<fileId>', the Orion image will be cached and fetched. This gets more interesting if you use it with the added option to resize the orion image by using the scheme '/image/orion/<fileId>/resize/<width>[/<height>]'.