# Drive Notepad

A webapp for editing text files in Google Drive, implemented entirely on the client-side.

**If you want general information and help using Drive Notepad, please go to [the main website](https://drivenotepad.github.io/).**

**The application is available [live on github](https://drivenotepad.github.io/app/).**

This document is only meant as a development reference.

---

### General Notes

If, for some reason, you decide to fork this and try and make it work you will need to register various things in the Google Developer Dashboard.
Other than that, the only thing you need is [`node`](https://nodejs.org/en/), you can then build with the command `npm run build`.

See the [Google api-explorer](https://developers.google.com/apis-explorer) for details of RESTful APIs.

Icons are from [modernuiicons.com](http://modernuiicons.com), then cropped with [this online tool](http://resizeimage.net), and base64 encoded for css with [this other online tool](http://websemantics.co.uk/online_tools/image_to_data_uri_convertor).

I use `python -m SimpleHTTPServer` for serving content, but you can do as you wish.

In the Google Develeoper Console you need [create OAuth2 2.0 client credentials](https://console.developers.google.com/apis/credentials) and [enable some APIs](https://console.developers.google.com/apis/enabled) - Drive API, Drive SDK, and Google Picker API.

All the interesting cloud-based stuff goes through the google javascript client library, which lives in the global `gapi`.  In most cases there are two ways to use a particular API: you can either `load` a specific API's javascript methods and make use of them; or you can use the generic `request` method, which helps you "manually" constructing the RESTful request.  We use the manual approach for reading and writing files, but the `load` approach for realtime stuff and picker, and sharer dialogs.

Occasionally chrome mistakenly caches source maps. If that happens, the easiest thing to do is go into the minified js file and add a query string to the source map url (which is specified in a special comment at the end).  Normally you won't need to do this, but it's annoying when it does happen.


### Introduction

When the page is loaded we either (try to) create a new document, or (try to) load an existing file.  Only one file can ever be loaded, if you need to load/create a new file you have to refresh the page.  This makes life a little simpler.

Everything is attached to the `dn` global object apart from a few basic utility functions in `utils.js`.  The widget's panes are manifested as module/closure things and are held as `dn.file_pane`, `dn.settings_pane`, `dn.find_pane`, etc. They each have their own `js` file, and they all have `.on_document_ready` methods which are called from the primary `document_ready` function in `app.js`.  Each module is responsible for displaying the given pane's current settings and making it interactive, but on the whole they do not make changes outside of the pane (the find tool is an exception as it changes the editor text, scroll position and markers).  In general we try and use some form of MVC paradigm for all panes - see section below.  `app.js` contains an important miscellany of functions that are not-specific to individual widget panes.

### Model-View-Controllers

There are (at least) two separate MVC systems at play in the app, one for the file's metadata and one for the application's setttings.  Interested parties can subscribe to a particular model's changes using `.addEventListener`.

The main model is `dn.g_settings`.  At some point after the page loads, this becomes a Google Realtime API `AppDataDocument` `Model`, before that it is a simple home-made object that behaves very similarly. When the realtime model becomes availble, we call `.transfer_to_true_model` on the mock version, which issues any required change events and then registers the old event listeners with the new model.  The home-made object uses `localStorage` for non-personal settings values so that it can restore them immediately on page load.  Also, when migrating to the real model, some settings give the cloud model prioroty and some give the local model priority, this prevents excessive jumpiness for highly-visible things that don't matter that much, ie. the widget's position.

A second model is `dn.the_file`, which is an instance of `dn.FileModel` (defined in `file_model.js`).  This is a relatively simple object which backs the metadata shown in the file pane.  The only complexity is that when you change some of the values it has to recompute some of the data, e.g. if you change the file's title it has to recompute the message about the detected syntax and, unless a syntax was explicity specified by the user, it must update the chosen syntax. For simplicity, saving (to the server) is handled by the controllers in `dn.file_pane`, it's just easier to tie the saving action to user actions rather than arbitrary updates on the model.

`app.js` is, among other things, a view for almost all of  `dn.g_settings`, and controller for some of it (e.g. widget position), it is also a view for most of `dn.the_file` (e.g. the document title and syntax choice).  `dn.settings_pane` is a view and controller for a subset of settings. `dn.file_pane` is a view and controller for `dn.the_file`.  `dn.help_pane` is a view and controller for just `dn.g_settings['help_inner']`.

`dn.find_pane` is a bit more complicated: all the settings roughly obey an MVC pattern, backed by `dn.g_settings`, but the values in the input boxes and currently selected result are implemented in a more ad-hoc manner.

### Making async API requests

I have tried to wrap most requests in ES6 `Promises`, or variations on that.  An important promise-like object is `dn.pr_auth`, this is a `SpecialPromise` instance, which can be `resolved` and `rejected` multiple times. As with regular promises, whenever it is resolved the callbacks registered with `.then(success)` are triggered, with each being triggered exactly once, even if `dn.pr_auth` is resolved multiple times.  And, as with regular promises, if `dn.pr_auth` has already been resolved at the moment that the `.then(success)` is registered, it will be triggered immediately.  Finally, the `dn.pr_auth` has two special event listeners: `on_error` and `on_success`, these are called every time the authentication process fails or is successful (respectively).

This behaviour allows us to have actions that wait on the auth token being valid, but if an auth error occurs at a later date we can set the promise to invalid and begin the re-authentication process.   For simplicity, we lump network errors (i.e. no internet) together with auth errors, that is `dn.pr_auth` is resolved when we have internet and authentication and is rejected when either is found to be unavailble. Any actions added after the failure point will await the resolution of the new promise. [The implementation could possibly have been written in terms of ES6 `Promises` rather than raw JS, but the JS implementation is fairly simple so has its merrits.]

As alluded to in the previous paragraphs, these API calls can fail due to sudden invalidation of the auth token.  When that happens we want to re-authenticate and then re-run any pending API calls.  This is quite a complex pattern, so it was wrapped into a utilty function, named `until_success`, and then posted as a [SO answer](http://stackoverflow.com/a/35782428/2399799) to a related question.  Here is an example of how it is used in this app:

```javascript
until_success(function(succ, fail){
    Promise.resolve(dn.pr_auth)
           .then(dn.request_user_info)
           .then(dn.show_user_info)
           .then(succ, fail);
}).before_retry(dn.filter_api_errors)
.then(function(){
    console.log('succeeded getting user info.')
}).catch(function(err){
    console.log("failed to load user info")
    console.dir(err);
    dn.show_error(dn.api_error_to_string(err));
});
```

In this code, `dn.show_user_info` is called once the API request on the line above succeeds, which in turn is only called when the auth token is available. If the auth token becomes available but is then mysteriously invalidated, the API request will be made and will fail.  This will cause that "iteration" of the `until_success` `Promise` to fail, invoking `dn.filter_api_errors`.  This handler will decide whether it is worth re-attempting the request, and if some form of re-authentication is neccessary it will start that process.  If the handler decides the error is "fatal", then the `until_success` "loop" exits with whatever the error was, and the `.catch` handler has to deal with it.  If and when the loop finally suceeds, the `.then` handler is called.

Note how if the `dn.filter_api_errors` function decides it is worth reattempting the request, the next iteration of `until_sucess` will start "immediately", but will hang at `resolve(dn.pr_auth)` until authentication is achieved.  It could be that the user needs to manually log in, or it could be the token has become invalid somehow and needs to be refreshed, or it might be that some kind of non-auth transient network error has occured. To guard against the possibility of issuing excessive numbers of automatic reauth requests there is an roughly exponential backoff process, which in the limit will only issue a request once per minute.  Note however that this backoff is specific to the automatic reauthentication, not to the `until_success` machienery.

Another important `Pomise`-like thing is `dn.pr_file_loaded`, this simply gets resolved soon after the page loads, when either an existing file is loaded or a new file is created.  If neither of those things ever succeed then this is never settled.  The fact that this is a promise, allows us to put it in the save chain, and the user can then actually issue save requests before the file is loaded, which is vaugely helpful when creating new files.


### Saving

The saving system allows for the user to issue multiple requets in quick succession, so that multiple requests are pending at the same time.  As the requests return, we check the server's version number to check that they were resolved in the correct order. If anything ended up out of order then we issue a correction save until the order is as we wanted it to be.  The things that can be saved are the file body, and the various pieces of metadata shown in the file pane.  A single request can contain one or more of these elements. We track the server's version number for each element separately, so we can make minimal corrections as needed.

Note that if there are other users/devices saving at the same time as the current user then there is no guarantee that they will see the same order of changes. The only guarantee is that if user X makes change A and then change B, then once user X receives confirmation of saving being completed, we know the server will defintiely not hold the value of change A.  It may hold the value from some other user or it may hold the change B. Also note that rather than simply holding value A then value B, it may have held value B, then A, then B', with B' identical to B but issued in a later "correction" request.

### Find/replace

It took a while to sort out focus/blur behaviour.  In the end it is now relatively neat and hopefully simple to get your head around.

`dn.g_settings.set('pane', 'pane_find')` and `dn.g_settings.set('pane_open', true)` do not mess with the focus themselves. 
Any code that uses that must explicitly decide whether or not it wants to focus on the input, calling `dn.find_pane.focus_on_input()`, if it whishes to.

Calling  `dn.g_settings.set('find_goto', bool)`, also does not mess with the focus, it just renders the inactive version of goto/search.

We basically have the same setup for goto and for search, with goto having a less meaty implementation, so it's easier to start by looking at that.

When the input gets the focus, the goto/search operation is performed, when the input is blurred it sets the info text to "inactive". 
 If the blur events is moving the focus to null, then at the end of the blur event we redirect the focus to the editor.

`dn.find_pane` has special functions for producing exactly the right focus behaviour for find/replace/gtoto keyboard shorcuts, and these functions are registered in `keyboard.js`.  Special behaviour when pressing Esc, but when the focus was on the editor, is implemented in `keyboard.js`.

The rules for cycling and modifying the find history list are a bit fiddly - see the `update_search_history` function for how we choose to make modification.  The main thing to note is that this function is only called on keydown (with ctrl-up/down) events in the find input, and when using the ctrl-f shortcut to focus on find with a new search string.


### Ace editor

Currently there are a few additions/changes to ace, which have been implemented as monkey patches in files called `js\patch_ace*.js`.  At some point it might be better to write them up properly in a fork of ace.  It's easy to build ace, so that shouldn't be a problem, but modifying the code "well" is a bit tricky because there's not a lot of documentation about its internals. 

