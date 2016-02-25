/**
 * Register the link
 */
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

var getRandomInt = function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

var rndImages=[];
var rndImage = function(callback) {
	if (!rndImages || !rndImages.length) {
		rndImages=[];

		var page_nr=getRandomInt(1,200);
		var consumer_key='vyhxftLMD6xO9Ev0rcL3qxZYd1v2UuZ58TwVm48v';

		var url='https://api.500px.com/v1/photos?feature=popular&page='+page_nr+'&image_size[]=4&consumer_key='+consumer_key;

        return Meteor.http.call('GET', url, {
          headers: {
            "content-type":"application/json",
            "Accept":"application/json"
          },
        },function(error, result) {
			// console.log({http:result});
			  _.each(result.data.photos,function(photo){
				  rndImages.push({link:photo.image_url[0],title:photo.name,description:photo.description});
			  });
		  	if (rndImages && rndImages.length) {
		  		return callback(null,rndImages.splice(0,1));
		  	}
		})

	}
	if (rndImages && rndImages.length) {
		return callback(null,rndImages.splice(0,1));
	}
}

function clear_html(html)
{
	return html.replace(/(<([^>]+)>)/ig,'');
}

function excerpt(html,count)
{	
	var text=clear_html(html).substring(0,count).trim();
	var olength=text.length;
	while (text && text.length && !/[\s\.\,]$/.test(text)) text=text.substr(0,text.length-1);
	text=text.trim()
	if (/[\s\.\,]$/.test(text)) text=text.substr(0,text.length-1);
	text=text.trim();
	return text+(text.length<(olength-2)?'&hellip;':'');
}

var IMAGE_FILES_INCREMENT = 6;

// whenever #imageFilesShowMoreResults becomes visible, retrieve more results
function imageFilesShowMoreResults() {
    // console.log('imageFilesShowMoreResults');
    var threshold, target = $('#imageFilesShowMoreResults');
    if (!target.length) return;
 
    threshold = $(window).scrollTop() + $(window).height() - target.height();
 
    if (target.offset().top < threshold) {
        if (!target.data('visible')) {
            // console.log('imageFiles target became visible (inside viewable area)');
            target.data('visible', true);
            Session.set('imageFilesLimit',Session.get('imageFilesLimit') + IMAGE_FILES_INCREMENT);
        }
    } else {
        if (target.data('visible')) {
            // console.log('imageFiles target became invisible (below viewable arae)');
            target.data('visible', false);
        }
    }        
}

ReactiveTemplates.onCreated('orionImageFiles', function() {
	$(window).scroll(imageFilesShowMoreResults);
	var self=this;
	// self.subscribe('image.files',Session.get('imageFilesLimit'),Session.get('imageFilesSearch'));
	this.autorun(function() {
		// console.log({imageFilesLimit:Session.get('imageFilesLimit'),imageFilesSearch:Session.get('imageFilesSearch')});
		// Meteor.subscribe('imageFilesInfinite',Session.get('imageFilesLimit'),Session.get('imageFilesSearch'));
		self.subscribe('image.files',Session.get('imageFilesLimit'),Session.get('imageFilesSearch'));
    });
    Session.setDefault('imageFilesLimit', IMAGE_FILES_INCREMENT);
    Session.setDefault('imageFilesSearch', '');
});

ReactiveTemplates.onRendered('orionImageFiles', function() {
	$('[data-toggle="tooltip"]').tooltip()
})

ReactiveTemplates.helpers('orionImageFiles', {
	imagefiles: function() {
		if (Roles.userHasRole(Meteor.userId(),'admin')) {
	        var imagefiles = ImageFiles.find({},{sort:{uploadDate:-1}});
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
	    return !(ImageFiles.find().count() < Session.get('imageFilesLimit'));
	},
	search() {
		return Session.get('imageFilesSearch');
	},
});

function search(value)
{
	// console.log(value);
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
			// console.log({img});
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
		// console.log('rs');
	    Session.set('imageFilesLimit', IMAGE_FILES_INCREMENT);
	    Session.set('imageFilesSearch', '');
	},
});



 




function grabId(id)
{
	// console.log(id);
	if (typeof id=='object' && id.id) id=id.id;
	if (typeof id=='string') {
			//ObjectID("56cb3263d4d84c1558605467")
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
			return excerpt(this.metadata.description);
		}
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
		// console.log({e});
		// console.log({this._id});
		var self=this;
		if (id) {
			bootbox.confirm('Are you sure you want to remove this image?', function(result) {
				if (result) {
					Meteor.call('removeImageFile',grabId(self._id));
				}
			}); 
		} else {
			console.log({e});
		}
	},
});
