"use strict";

dn.save_pending_requests = [];

dn.SaveTracker = function(){
    this.local = undefined;
    this.remote = undefined;
    return this;
}

dn.save_local_version_counter = 0;

// this list tracks the state of the server, to the best of our knowledge,
// i.e. based on all the respones we have recieved to date (we use the 
// server's "version" number to ensure we maintain the same chronology as the server).
dn.save_server_state = {};

// this is similar to the above but holds SaveRequest instances. Every time
// we construct a new SaveRequest, we update this list.
dn.save_local_state = { };


dn.save = function(parts, correction_with_undo_id){
    // this is the only method that should be called by other bits of the program

    if(!dn.status.user_wants_file){
        // this is the first sign the user has given that they actually want a file 
        // i.e. they want a new file to be created.
        // This is different to all other saves because we wait for it to return before
        // issuing any later requests, although we can still put requests into the queue.
        dn.create_file(); // this only saves the title, it will set user_wants_file to 1, 
                          // and evetunally settle the Promise dn.pr_file_loaded.
        parts.title = undefined; // we don't need to deal with title here
    }

    // update the status, and deal undo manager tracking...
    var found_something = false;
    if(parts.body !== undefined){
        var editor_undo_id = correction_with_undo_id === undefined ? 
                              dn.editor.getSession().getUndoManager().getCurrentId()
                            : correction_with_undo_id;
        if(dn.save_undo_id === editor_undo_id){ // during correction requests, save_undo_id will already be NaN, so this test will fail
            delete parts.body; // no need to save the body if it's already on the server
            // TODO: actually, saves could be in progress, in which case we don't actually know for sure what is on the server
            // i.e. you might want to send an "undo" save before a mistake save has completed
        } else {
            found_something = true;
            dn.save_undo_id = NaN; // while we are saving the body the document can only be "dirty"
            parts.undo_id = editor_undo_id; // TODO: when making corrections, we need to copy this across
            dn.check_unsaved();
            parts.mimeType = parts.mimeType || dn.the_file.chosen_mime_type;
            dn.status.save_body = 0;
        }
    }
    if(parts.title !== undefined){
        found_something = true;
        dn.status.save_title = 0;
    }
    if(parts.syntax !== undefined ||
       parts.description !== undefined ||
       parts.newline !== undefined ||
       parts.tabs !== undefined){
            found_something = true;
            dn.status.save_other = 0;
    }
    
    if(!found_something)
        return;

    dn.show_status();

    // and construct the (complicated) request..
    dn.save_pending_requests.push(new dn.SaveRequest(parts));
}

dn.SaveRequest = function(parts){
    //console.log("SaveRequest: " + JSON.stringify(parts));
    this._parts = parts

    // update save_local_state 
    var displaced_requests = [];
    for(var k in this._parts) if(this._parts.hasOwnProperty(k)){
        if(dn.save_local_state[k] && !dn.save_local_state[k]._is_settled)
            displaced_requests.push(dn.save_local_state[k]);
        dn.save_local_state[k] = this;
    }

    // see if any of the displaced requests that are still pending, are no longer desired.
    // We can't competely cancel pending requests, but we can make it known that they
    // should stop trying so hard to complete.
    for(var ii=0; ii< displaced_requests.length; ii++){
        var desired = false; // if displaced_requests[ii] is responsible for any of save_local_state, then it is desired still 
        for(var k in dn.save_local_state) if(dn.save_local_state.hasOwnProperty(k))
            if(dn.save_local_state[k] == displaced_requests[ii]){
                desired = true;
                break;
            }
        if(!desired)
            displaced_requests[ii]._desired = false;
    }


    this._desired = true; // see above description and _throw_if_not_desired, to see how this is used
    this._tracker = new dn.SaveTracker(); // hold local and remote version numbers
    this._tracker.local = ++dn.save_local_version_counter;
    this._is_settled = false;
    this._error = undefined;

    var self = this;
    this._pr =
    until_success(function(succ, fail){
        Promise.all([dn.pr_auth, dn.pr_file_loaded])
          .then(self._throw_if_not_desired.bind(self))
          .then(dn.request_save(self._parts))
          .then(self._on_completion.bind(self))
          .then(succ, fail);
    }).before_retry(dn.filter_api_errors)
    .catch(self._on_error.bind(self))
    .then(self._on_finally.bind(self))

    return this;
}

dn.SaveRequest.prototype._throw_if_not_desired = function(){
    if(!this._desired)
        throw "not desired"; //caught by on_error, and turned into success
    return true;
}

dn.SaveRequest.prototype._on_error = function(err){
    if(err !== "not desired")
        this._error = err; // an actual error, record it
}

dn.SaveRequest.prototype._on_completion = function(res){
    this._tracker.remote = parseInt(res.result.version);
    // update 0 or more entries in dn.save_server_state (see description above)
    for(var k in this._parts) if(this._parts.hasOwnProperty(k)){
        if(dn.save_server_state[k] === undefined)
            dn.save_server_state[k] = new dn.SaveTracker();
        if(dn.save_server_state[k].remote === undefined || this._tracker.remote > dn.save_server_state[k].remote){
            dn.save_server_state[k].remote = this._tracker.remote;
            dn.save_server_state[k].local = this._tracker.local;
        }
    }  
    return true;    
}

dn.SaveRequest.prototype._on_finally = function(){
    // called when the until_success deems that success has occured
    // but that means the request was a legitimate failure, or canaceled,
    // though at this point we don't care what happened exactly.

    if(this._error !== undefined){
        dn.show_error("Saving failed. " + dn.api_error_to_string(this._error));
        console.dir(this._error);
        // abandon all requests, but note they may still continue executing
        while(dn.save_pending_requests.length)
            dn.save_pending_requests.pop()._desired = false;
        // and reset out records to be totally "naive"
        dn.save_server_state = {};
        dn.save_local_state = {};
        
        // show that we're no longer trying to save...
        dn.status.save_body = 1;
        dn.status.save_title = 1;
        dn.status.save_other = 1;
        dn.show_status();
        return;
    }

    // remove from the list of pending requests
    this._is_settled = true;
    dn.save_pending_requests.splice(dn.save_pending_requests.indexOf(this), 1);

    // if other requests are still pending, let them clean up any mess when they're done..
    // TODO: actually, we could do this separately for each key in save_*_state.
    if(dn.save_pending_requests.length > 0)
        return;

    // dn.save_local_state holds the state we want the server to have, and 
    // dn.save_server_state holds the state the server ended up with 
    // (and remember there are no pending requests), so lets build a list
    // of corrections to make to the server
    var correction = {};
    var correction_need = false;
    for(var k in dn.save_local_state) if(dn.save_local_state.hasOwnProperty(k))
        if(dn.save_server_state[k].local !== dn.save_local_state[k]._tracker.local){
            correction[k] = dn.save_local_state[k]._parts[k];
            correction_need = true;
        }

    // and now we can make the request, if we need to..
    dn.status.save_body = 1; 
    dn.status.save_title = 1;
    dn.status.save_other = 1;

    var local_undo_id = dn.save_local_state.body ? dn.save_local_state.body._parts.undo_id : undefined;
    if(correction.body === undefined && local_undo_id !== undefined){
        dn.save_undo_id = dn.save_local_state.body._parts.undo_id; // we know the server now has this undo point
        dn.check_unsaved();
    }

    if (correction_need)
        dn.save(correction, local_undo_id); // this will set some of the status's to 0 and call show_status
    else
        dn.show_status();

}




