let IMAGEFILE_IMAGE_WIDTH=330;

Tracker.autorun(function() {
  orion.links.add({
    index: 9150,
    identifier: 'orion-imagefiles',
    title: 'Image Files',
    routeName: 'jorisroling.orionImageFiles',
    activeRouteRegex: 'jorisroling.orionImageFiles',
    permission: 'jorisroling.orionImageFiles'
  });
});

var rndImage = function(callback) {
  Meteor.call('randomPexelImage',(err,photo) => {
    if (photo) callback(null,{link:photo.src.large2x,title:'by '+photo.photographer,description:''})
  });
}

function clear_html(html)
{
	return html.replace(/(<([^>]+)>)/ig,'');
}

function excerpt(html,count)
{
	var text=clear_html(html)
	if (count) text=text.substring(0,count)
	text=text.trim();
	var olength=text.length;
	if (count && olength>count) {
		while (text && text.length && !/[\s\.\,]$/.test(text)) text=text.substr(0,text.length-1);
		text=text.trim()
		if (/[\s\.\,]$/.test(text)) text=text.substr(0,text.length-1);
		text=text.trim();
	}
	return text+((count && olength>count && (text.length<(olength-2)))?'&hellip;':'');
}

var IMAGE_FILES_INCREMENT = 12;

// whenever #imageFilesShowMoreResults becomes visible, retrieve more results
function imageFilesShowMoreResults() {
    var threshold, target = $('#imageFilesShowMoreResults');
    if (!target.length) return;

    threshold = $(window).scrollTop() + $(window).height() - target.height() + ($(window).height() /3);
    // threshold = $(window).scrollTop() + $(window).height() - target.height();

    if (target.offset().top < threshold) {
        if (!target.data('visible')) {
            target.data('visible', true);
            Session.set('imageFilesLimit',Session.get('imageFilesLimit') + IMAGE_FILES_INCREMENT);
        }
    } else {
        if (target.data('visible')) {
            target.data('visible', false);
        }
    }
}

ReactiveTemplates.onCreated('orionImageFiles', function() {
	$(window).scroll(imageFilesShowMoreResults);
	var self=this;
	// self.subscribe('image.files',Session.get('imageFilesLimit'),Session.get('imageFilesSearch'));
	this.autorun(function() {
		self.subscribe('image.files',Session.get('imageFilesLimit'),Session.get('imageFilesSearch'));
    });
    Session.setDefault('imageFilesLimit', IMAGE_FILES_INCREMENT);
    Session.setDefault('imageFilesSearch', '');
});

function setResizer()
{
	$(function(){
	    Session.set('ImageFilesColumWidth',$('#orionImageFiles li[data-isotope-position]').width());

	    $( window ).on('resize', function() {
			Session.set('ImageFilesColumWidth',$('#orionImageFiles li[data-isotope-position]').width());
	    });
	});
}

ReactiveTemplates.onRendered('orionImageFiles', function() {
	$('[data-toggle="tooltip"]').tooltip();

	setResizer();
	for (let i=0;i<10;i++) Meteor.setTimeout(setResizer,i*1000);
})

ReactiveTemplates.helpers('orionImageFiles', {
	imagefiles: function() {
		if (Roles.userHasRole(Meteor.userId(),'admin')) {
	        var imagefiles = ImageFilesCollection.find({},{sort:{uploadDate:-1}});
			return imagefiles;
	        // return imagefiles.map(function(imagefile, index, cursor) {
	        //     imagefile._index = ++index;
	        //     return imagefile;
	        // });
		}
	},
	moreResults() {
	    // If, once the subscription is ready, we have less rows than we
	    // asked for, we've got all the rows in the collection.
	    return (Counts.get('image.files') > Session.get('imageFilesLimit'));
	    // return !(ImageFilesCollection.find().count() < Session.get('imageFilesLimit'));
	},
	search() {
		return Session.get('imageFilesSearch');
	},
});

function search(value)
{
	let rvalue=Session.get('imageFilesSearch')||'';
	if (!value) value='';
	if (rvalue!=value) {
		Session.set('imageFilesLimit',IMAGE_FILES_INCREMENT);
		Session.set('imageFilesSearch',value);
	}
}

ReactiveTemplates.events('orionImageFiles', {
	'click .image-preview':function(e) {
		rndImage(function(err,img) {
			if (Array.isArray(img) && img.length) img=img[0];
			var src='/image?url='+encodeURIComponent(img.link);
			if (img.title && img.title.length) src+='&title='+encodeURIComponent(img.title);
			if (img.description && img.description.length) src+='&description='+encodeURIComponent(img.description);
			if (!err && img) $('.image-preview').attr('src',src);
		});
	},
	'keyup #image-search': _.throttle(function(e,t) {
		e.preventDefault();
		search(e.target.value);
	},400,{lead:false}),
	'submit .image-new': function (e) {
		e.preventDefault();
		$('.image-preview').attr('src','/image?url='+encodeURIComponent(e.target.imagelink.value));
		e.target.imagelink.value = '';
	},
	'submit .image-search': function (e) {
		e.preventDefault();
		search(e.target.imagesearch.value);
	},
	'click .remove-search': function(e) {
	    Session.set('imageFilesLimit', IMAGE_FILES_INCREMENT);
	    Session.set('imageFilesSearch', '');
	},
});








function grabId(id)
{
	if (typeof id=='object' && id.id) id=id.id;
	if (typeof id=='string') {
			//ObjectID('56cb3263d4d84c1558605467')
		var myRegexp=/^ObjectID\("(.*?)"\)$/
		var match = myRegexp.exec(id);
		if (match && match.length>1 && match[1]) {
			return match[1];
		}
	} else if (typeof id=='object' && id._str) {
		return id._str;
	}
	return id;
}


Template.imageFileCard.helpers({
	id() {
		return grabId(this._id);
	},
	title() {
		if (this.metadata && typeof this.metadata.title=='string') {
			return this.metadata.title.replace(/[0-9]{5,32}/g,'').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
		}
		if (typeof this.filename=='string') {
			return this.filename.replace(/[a-f0-9]{32,32}/gi,'').replace(/[0-9]{5,32}/g,'').replace(/[-_\.]+/g,' ').replace(/(jpg|jpeg|png|gif)$/i,' ').replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
		}
	},
	description() {
		if (this.metadata && typeof this.metadata.description=='string') {
			return clear_html(this.metadata.description);
		}
	},
	excerpt() {
		if (this.metadata && typeof this.metadata.description=='string') {
			return excerpt(this.metadata.description,256);
		}
	},
	fulltext() {
		if (this.metadata && typeof this.metadata.description=='string') {
			return excerpt(this.metadata.description);
		}
	},
	imageWidth() {
		let ImageFilesColumWidth=Session.get('ImageFilesColumWidth');
		if (!ImageFilesColumWidth || ImageFilesColumWidth<100) {
			ImageFilesColumWidth=$('#orionImageFiles li[data-isotope-position]').width();
			if (ImageFilesColumWidth) Session.set('ImageFilesColumWidth',ImageFilesColumWidth);
		}
		if (ImageFilesColumWidth) {
		    let width=ImageFilesColumWidth-16;
			if (width>0 && this.metadata && this.metadata.width && this.metadata.height) {
				return ((width>this.metadata.width)?this.metadata.width:width)+'px';
			}
		}
		return 'auto';
	},
	imageHeight() {
		let ImageFilesColumWidth=Session.get('ImageFilesColumWidth');
		if (!ImageFilesColumWidth || ImageFilesColumWidth<100) {
			ImageFilesColumWidth=$('#orionImageFiles li[data-isotope-position]').width();
			if (ImageFilesColumWidth) Session.set('ImageFilesColumWidth',ImageFilesColumWidth);
		}
		if (ImageFilesColumWidth) {
			let width=ImageFilesColumWidth-16;
			if (width>0 && this.metadata && this.metadata.width && this.metadata.height) {
				return ((width>this.metadata.width)?this.metadata.height:Math.round(this.metadata.height/(this.metadata.width/width)))+'px';
			}
		}
		return 'auto';
	},
	ago() {
		return moment(this.uploadDate).fromNow();
	},
	isImage() {
		return (/^image\//.test(this.contentType)) ;
	},
	icon() {
		let icon=mimetype2fa(this.contentType,{ prefix: 'fa-' })
		return icon?('fa '+icon):'';
	}
});

Template.imageFileCard.events({
	'click img[data-toggle="lightbox"]': function(e) {
        e.preventDefault();
		var options={
			remote:e.target.src,
			title:this.title,
			footer:this.description,
			type:'image'
		};
		$(e.target).ekkoLightbox(options);
	},
	'click .imageFileRemove': function(e){
		e.preventDefault();

		var id=e.target.parentNode.parentNode.parentNode.dataset.isotopeItemId;
		var self=this;
		if (id) {
			bootbox.confirm({
          message: 'Are you sure you want to remove this image?',
          buttons: {
              confirm: {
                  label: 'Yes',
                  className: 'btn-danger'
              },
              cancel: {
                  label: 'Cancel',
                  className: 'btn-default'
              }
          },
          callback: function (result) {
    				if (result) {
    					Meteor.call('removeImageFile',grabId(self._id));
    				}
          }
      });
		} else {
			console.error({e});
		}
	},
});











var mapping = [
  // Images
  [ 'file-image-o', /^image\// ],
  // Audio
  [ 'file-audio-o', /^audio\// ],
  // Video
  [ 'file-video-o', /^video\// ],
  // Documents
  [ 'file-pdf-o', 'application/pdf' ],
  [ 'file-text-o', 'text/plain' ],
  [ 'file-code-o', [
    'text/html',
    'text/javascript'
  ] ],
  // Archives
  [ 'file-archive-o', /^application\/(x-)?g?(zip|tar)$/ ],
  // Word
  [ 'file-word-o', [
    /ms-?word/,
    'application/vnd.oasis.opendocument.text',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ] ],
  // Powerpoint
  [ 'file-powerpoint-o', 'application/mspowerpoint' ],
  // Excel
  [ 'file-excel-o', 'application/msexcel' ],
  // Default, misc
  [ 'file-o' ]
]

function match (mimetype, cond) {
  if (Array.isArray(cond)) {
    return cond.reduce(function (v, c) {
      return v || match(mimetype, c)
    }, false)
  } else if (cond instanceof RegExp) {
    return cond.test(mimetype)
  } else if (cond === undefined) {
    return true
  } else {
    return mimetype === cond
  }
}

var cache = {}

function resolve (mimetype) {
  if (cache[mimetype]) {
    return cache[mimetype]
  }

  for (var i = 0; i < mapping.length; i++) {
    if (match(mimetype, mapping[i][1])) {
      cache[mimetype] = mapping[i][0]
      return mapping[i][0]
    }
  }
}

function mimetype2fa (mimetype, options) {
  if (typeof mimetype === 'object') {
    options = mimetype
    return function (mimetype) {
      return mimetype2fa(mimetype, options)
    }
  } else {
    var icon = resolve(mimetype)

    if (icon && options && options.prefix) {
      return options.prefix + icon
    } else {
      return icon
    }
  }
}



Template.registerHelper('orionImage', function(url,width,height)
{
  let result = url.replace('/gridfs/data/id/','/image/orion/')
  if (width || height) {
    result+='/resize/'+(width?width:'0')+(height?('/'+height):'')
  }
	return result;
});


