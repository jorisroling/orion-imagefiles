#ImageFiles for Orion

This package give's an image cache for images originating from remote sites. All images are stored in the MongoDB database, and only retrieved from the remote site if the image does not exist in the database.

##To Install
```meteor add jorisroling:orion-imagefile```

##Use
By adressing your own server with the path '/image?url=<ORIGINAL URL>' For example:
```<img src="/image?url=https://goo.gl/tYtM9F"```

Mind you, you should make sure the URL passed is properly url encoded. Use ```encodeURIComponent()``` for this.
So the above example should probably read
```<img src="/image?url=https%3A%2F%2Fgoo.gl%2FtYtM9F"```


