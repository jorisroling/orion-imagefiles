/**
 * Init the template name variable
 */
ReactiveTemplates.request('orionImageFiles', 'jorisroling_orionImageFiles_bootstrap');

/**
 * Init the role action
 */
Roles.registerAction('jorisroling.orionImageFiles', true);

/**
 * Register the route
 */
RouterLayer.route('/admin/imagefiles', {
  layout: 'layout',
  template: 'orionImageFiles',
  name: 'jorisroling.orionImageFiles',
  reactiveTemplates: true
});

/**
 * Ensure user is logged in
 */
orion.accounts.addProtectedRoute('jorisroling.orionImageFiles');

ImageFilesCollection = new Meteor.Collection('image.files');