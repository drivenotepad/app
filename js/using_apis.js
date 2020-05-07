"use strict";

/*
    Working with oauth2 APIs has its complexities, some of which
    are dealt with by the google client library, but some of which
    are exposed for us to deal with.

    These functions do the majority of the fiddly stuff.  In particular,
    the dn.request_* functions are designed to be used in a promise chain
    within a until_success call. See the readme for additional explanation.

    You can insert the request_screw_up_auth into a promise chain to check 
    how the chain handles unexpected invalidation.

*/

dn.filter_api_errors = function(err){
    // this is designed for use in conjunction with until_success
    if(dn.is_auth_error(err)){
        dn.pr_auth.reject(err); //will trigger some kind of re-authnetication
        return false; // continue with next attempt
    }else{
        throw err; // this is an unrecognised error
    }
}

dn.is_auth_error = function(err){
    // returns :
    // 0 for fatal errors
    // 1 for recommended auto refresh
    // 2 for recommended manual refresh
    // 3 for network error/timeout, recommend test network and retry
    // 4 for server error, recommend retry (ideally with exponential backoff)

    if(!err)
        return 2;

    
    try{
        if(err.status > 200){
            var str = "status: " + err.status + "   ";
            if(err.result && err.result.error)
                str += JSON.stringify(err.result.error);
            str += " dn.status: " + JSON.stringify(dn.status);
            str += " stack: " + (new Error()).stack;
            ga('send', 'exception', {'exDescription': str});
        }
    }catch(_){}
    

    if(err.type === "token_refresh_required" || err.status === 401)
        return 1;

    if(err.status === 403){
        var reason = ""
        try{reason = err.result.error.errors[0].reason;}catch(_){};

        if(reason === "domainPolicy")
            return 0;
        if(reason === "insufficientFilePermissions")
            return 0; // should only happen if file becomes read-only after the page loads
        if(reason === "cannotDownloadAbusiveFile")
            return 0; // this is not documented but appears in logs

        //TODO: handle other specifics, and include exponential backoff where appropriate
        return 1; // a variety of things here
    }
    if(err.status === 404)
        return 0; // file not found
    if(err === "timeout")
        return 3;
    if(err.result && err.result.error && err.result.error.code === -1)//network error
        return 3;
    if(err.status === 400)
        return 0; // bad request
    if(err.status === 500)
        return 4;
    return 0;
}

dn.api_error_to_string = function(err){

    if(!err)
        return "Error.";
    var reason = ""
    try{reason = err.result.error.errors[0].reason;}catch(_){};
    if(reason === "insufficientFilePermissions")
        return "You do not have permission to modify the file.";
    if(reason === "domainPolicy")
        return "Your domain administrators have disabled Drive apps."

    if(err.result && err.result.error && err.result.error.message !== undefined){
        return "" + err.result.error.message;
    } else {
        console.log("Strangely structured error:")
        console.dir(err);
        return "Error. See developer console for details."
    }
}

dn.handle_auth_error = function(err){

    console.dir("ERROR: "+JSON.stringify(err));
    if(!err.status.signed_in){
        console.dir("ERROR user not signed in: "+JSON.stringify(err));

        return dn.toggle_permission(true);


        if(!err.status.google_logged_in){
            dn.reauth_auto();
        }
    }
    
    // this is the error handler for dn.pr_auth

    dn.status.authorization = -1;
    dn.status.popup_active = 0;
    dn.show_status();
    var err_type = dn.is_auth_error(err);

    if(err_type === 0){
        dn.show_error(dn.api_error_to_string(err));
    }else if(err_type == 1){
        dn.reauth_auto();
    }else if(err_type == 2){
        // user has to click button to trigger reauth-manual
        dn.toggle_permission(true);
    }else{
        // should be network error
        dn.show_error("network error. retrying...");
        offline_simple.commence_testing(); // we have already registered a listener that will resolve pr_auth when the connection is restored
    }
}

dn.reauth_auto_delay_chain = {0: 1, 1:500, 500: 1000, 1000: 2500, 2500: 5000, 5000: 10000, 10000: 60000, 60000: 60000}
dn.reauth_auto = function(){ 
    // with roughly-exponetial backoff...
    if (!dn.reauth_auto_timer){
        // 1ms, 500ms, 1s, 2s, 5s, 10s, 60s.
        if(!dn.reauth_auto_delay)
            dn.reauth_auto_delay = dn.reauth_auto_delay_chain[0];
        else
            dn.reauth_auto_delay = dn.reauth_auto_delay_chain[dn.reauth_auto_delay];
        dn.status.authorization = 0;
        dn.show_status();
        console.log("issuing auto reauth with delay " + dn.reauth_auto_delay + "ms.")
        dn.reauth_auto_timer = setTimeout(function(){
            dn.reauth_auto_timer = undefined;
            console.log("and now running the auto reauth...")
            Promise.race([gapi.auth.authorize(dn.auth_map(true)), make_timeout(dn.const_.auth_timeout)])
                   .then(dn.pr_auth.resolve.bind(dn.pr_auth),
                         dn.pr_auth.reject.bind(dn.pr_auth));
        }, dn.reauth_auto_delay)
    } else {
        console.log("auto reauth already due to be sent")
    }
}

dn.reauth_manual = function(){
    // if this succeeds it will trigger dn.pr_auth.resolve, which will call 
    // any pending (and future) success callbacks.
    dn.status.popup_active = 1;
    dn.status.authorization = 0;
    dn.show_status();    
    Promise.resolve(gapi.auth.authorize(dn.auth_map(false)))
           .then(dn.pr_auth.resolve.bind(dn.pr_auth),
                 dn.pr_auth.reject.bind(dn.pr_auth));
}

dn.request_user_info = function(){
    // returns thenable
    return gapi.client.request({'path' : 'userinfo/v2/me?fields=name'})
}

dn.request_file_meta = function(){
    // returns thenable
    return gapi.client.request({
        'path': '/drive/v3/files/' + dn.the_file.file_id,
        'params':{'fields': 'id,name,mimeType,description,parents,capabilities,fileExtension,shared,properties'}});
}

dn.request_file_body = function(){
    // returns thenable
    return gapi.client.request({
        'path': '/drive/v3/files/' + dn.the_file.file_id,
        'params':{'alt': 'media'},
        'headers': {'contentType': 'charset=utf-8'}});
}

dn.make_multipart_boundary = function(){
    //for MIME protocol, require a boundary that doesn't exist in the message content.
    //we could check explicitly, but this is essentially guaranteed to be fine:
    // e.g. "13860126288389.206091766245663"
    return (new Date).getTime() + "" + Math.random()*10;
}

dn.request_new = function(folder_id, title){
    // this is a factory function for building a function-of-no-args-that-returns-a-thenable
    var meta = {name: title};
    if(folder_id !== undefined)
        meta['parents'] = [folder_id];
    return function(){
       return gapi.client.request({
                'path': '/drive/v3/files/',
                'method': 'POST',
                'params' : {'fields': 'id,name,mimeType,description,parents,capabilities,fileExtension,shared'},
                'body' : JSON.stringify(meta)
        });
    };
}

dn.request_revision_list = function(){
    // returns thenable
    return gapi.client.request({
        'path': '/drive/v3/files/' + dn.the_file.file_id + "/revisions"});
}

dn.request_revision_body = function(revision_id){
    // returns a function that returns a thenable
    // note that annoyingly you cant use batch requests with alt=media,
    return function(){
        return gapi.client.request({
          'path': '/download/drive/v3/files/' + dn.the_file.file_id + "/revisions/" + revision_id,
          'params':{'alt': 'media'}});
    };
}


dn.request_save = function(parts){
    // this is a factory function for building a function-of-no-args-that-returns-a-thenable
    // note the save process is complicated and should only be done via dn.save in save.js
    var has_body = parts.body !== undefined;
    var meta = {properties: {}};
    var has_meta = false;
    if(parts.title !== undefined){
        has_meta = true;
        meta['name'] = parts.title;
    }
    if(parts.description !== undefined){
        has_meta = true;
        meta['description'] = parts.description;
    }
    if(parts.syntax !== undefined){
        has_meta = true;
        meta.properties['aceMode'] = parts.syntax;
    }
    if(parts.newline !== undefined){
        has_meta = true;
        meta.properties['newline'] = parts.newline;
    }
    if(parts.tabs !== undefined){
        has_meta = true;
        meta.properties['tabs'] = parts.tabs;
    }
    var is_multipart = has_body && has_meta;
    var params = {'fields': 'version'};
    if(has_body)
        params['uploadType'] = is_multipart ? 'multipart' : 'media';

    var headers = {}
    if(is_multipart){
        var boundary = dn.make_multipart_boundary();
        request_body = "--" + boundary
                      + "\nContent-Type: application/json; charset=UTF-8\n\n" 
                      + JSON.stringify(meta) 
                      + "\n--" + boundary
                      + "\nContent-Type: " + parts.mimeType + "; charset=UTF-8\n\n" 
                      + parts.body
                      + "\n--" + boundary + "--" ;
        headers['Content-Type'] = 'multipart/related; boundary="' + boundary+'"';
        // TODO: check if we need to add the content length ourselves
        // Content-Length: number_of_bytes_in_entire_request_body
    }else if(has_body){
        request_body = parts.body;
        headers["Content-Type"] = parts.mimeType;
    } else {
        request_body = JSON.stringify(meta);
    }

    return function(){
        return gapi.client.request({
                'path': (has_body ? '/upload' : '') + '/drive/v3/files/' + dn.the_file.file_id,
                'method': 'PATCH',
                'params' : params,
                'headers' : headers,
                'body' : request_body
        });
    }

}

dn.request_app_data_document = function(){
    return new Promise(function(succ, fail){

        // we want one error handler for loading, and one for subsequent errors, but the API doesn't
        // distinguish between the two, so it's up to us to do so....
        dn.app_data_realtime_error = function(err){
            if(dn.status.realtime_settings < 1){
                fail(err);
            }else{
                if(err.type === "token_refresh_required"){
                    dn.pr_auth.reject(err);
                } else {
                    console.dir(err);
                    dn.show_error("" + err);
                }
            }
        }

        gapi.drive.realtime.loadAppDataDocument(succ, null, dn.app_data_realtime_error);
        // the null argument is an omptional function for handling the initialization
        // the first time the document is loaded;
    });
}


//*
dn.request_screw_up_auth_counter = 0;
dn.request_screw_up_auth = function(){
    if(++dn.request_screw_up_auth_counter < 10){
        console.log("INVALIDATING TOKEN")
        gapi.auth.setToken("this_is_no_longer_valid");
    }
    return true;
}
//*/