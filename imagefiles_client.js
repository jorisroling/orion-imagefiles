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
	}
});

ReactiveTemplates.events('orionImageFiles', {
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
