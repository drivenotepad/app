"use strict";

dn.history_tool = (function(){

var el = {};

var revision_meta = []; // we clear this each time we call refresh_revisions_list
var worker_has_revision = {}; // we cache revision bodies on the worker, recording true here when we do using revision id as the key
var revision_uses_line = []; // for each revision this has a 1d boolean array, giving 1 if the line is used in that revision.
                             // every time we get a "delivery" of new lines from the worker we invalidate all of this. In future,
                             // when we want to display a particular revision we have to ask the worker for the data.

var worker;
var editor;
var at_idx = 0; 
var from_idx = 0;


var LineWidgets = ace.require("./line_widgets").LineWidgets;
var start = function(){
    // TODO: add current state to revisions meta and body

    if(worker === undefined){
        worker = new Worker("js/history_tool_worker.js");
        worker.onmessage = on_worker_message;
    }

    dn.el.editor.style.display = 'none';
    el.revisions_view.style.display = '';
    el.revisions_view.innerHTML = '';
    el.info_overflow.style.display = '';
    editor = ace.edit("revisions_view");
    editor.setFontSize(dn.editor.getFontSize());
    dn.patch_editor_history(editor); 
    editor.session.setUseWrapMode(true);
    editor.setReadOnly(true);
    refresh_revisions_list();
}

var end = function(){
    // destroy the editor, and replace its dom element with a newly cloned instance
    // this wipes out any event listeners.  https://github.com/ajaxorg/ace/issues/2085
    // also set the element's contents to be empty
    editor.destroy();
    editor = undefined;
    el.revisions_view.innerHTML = '';
    var el_old = el.revisions_view;
    el.revisions_view = el_old.cloneNode(true);
    el_old.parentNode.replaceChild(el.revisions_view, el_old);

    dn.el.editor.style.display = '';    
    el.revisions_view.style.display = 'none';
    el.info_overflow.style.display = 'none';
}

var get_editor = function(){
    return editor;
}

var on_worker_message = function(e){
    if(!editor) return;  // if we closed history tool while worker was busy, we can safely ignore the two possible types of message it might be sending

    var session = editor.getSession();
    if(e.data.diffed_revision){
        revision_uses_line = []; // invalidate everything we knew about uses_line
        // TODO: perhaps we should batch up the newly delivered data and only append it when the user requests an earlier revision
        if(e.data.diffed_revision.idx === 0){
            session.doc.insertFullLines(-1, e.data.diffed_revision.lines); // resets to supplied lines
        } else {
            session.doc.insertFullLines(e.data.diffed_revision.sections); // inserts multiple batches of lines
            revision_meta[e.data.diffed_revision.idx].el_tick.classList.add('diffed');
        }
    }

    if(e.data.line_is_used){
        var idx = e.data.line_is_used.idx;
        revision_uses_line[idx] = new Uint8Array(e.data.line_is_used.buffer);
        if(idx === Math.max(at_idx, from_idx)){
            // hooray, we've got both at and from, lets render 'em, quick!
            if(at_idx === from_idx)
                render_single_revision(at_idx);
            else
                render_revision_pair(at_idx, from_idx);
        }else if(Math.max(at_idx, from_idx) >= e.data.line_is_used.diffed_n && idx == Math.min(at_idx, from_idx)){
            // well, we've got the mroe recent of the two, and the other one is going to be a while, so lets render what we have
            render_single_revision(Math.min(at_idx, from_idx));
        }
    }


}


var render_single_revision = function(idx){
    editor.show_rows(revision_uses_line[idx]); // 1=show, 0=hide, which is exactly what we want
    var str = "";
    if(idx === 0){
        str = "Showing the file:\n\t" + current_version_date_str;
    }else{
        var time = date_str_to_local(revision_meta[idx].modifiedTime)
        str = "Showing file as it was at:\n\t" + time[1] + " on " + time[0];
    }
    text_multi(el.info, str);
}

var fuse = function(at_is_used, from_is_used){
    // maps: (0,0) => 0   (1,1) => 1   (1,0) => 3   (0,1) => 2
    // TODO: maybe there would have been a slightly clever maping to have chosen, but it doesn't matter much.
    var map = new Uint8Array([0,2,3,1]);
    var show_rows = new Uint8Array(at_is_used.length);
    for(var ii=0; ii< show_rows.length; ii++)
        show_rows[ii] = map[at_is_used[ii] | (from_is_used[ii] << 1)];
    return show_rows;
}

var current_version_date_str = "as it exists in the editor";

var render_revision_pair = function(at_idx, from_idx){
    editor.show_rows(fuse(revision_uses_line[at_idx], revision_uses_line[from_idx]));

    var str = ""
    if(at_idx === 0){
        str += "Showing the file:\n\t" + current_version_date_str;
    }else{
        var time_at = date_str_to_local(revision_meta[at_idx].modifiedTime);
        str += "Showing file as it was at:\n\t" + time_at[1] + " on " + time_at[0];
    }
    if(from_idx === 0){
        str += "\nWith changes relative to the file:\n\t" + current_version_date_str;
    }else{
        var time_from = date_str_to_local(revision_meta[from_idx].modifiedTime);
        str += "\nWith changes relative to the file at:\n\t" + time_from[1] + " on " + time_from[0];
    }
    text_multi(el.info, str);
}

var append_tick = function(){
    var el_tick = document.createElement('div');
    el_tick.classList.add('revision_tick');
    el.tick_box.appendChild(el_tick);
    return el_tick;
}

var send_revisions_order_to_worker = function(resp){
    var r_to_get = [], id_order = [];
    revision_meta = revision_meta.concat(resp.result.revisions.reverse()); 
    el.at_range.max = revision_meta.length - 1;
    el.from_range.max = revision_meta.length - 1;

    for(var ii=1; ii<revision_meta.length; ii++){
        id_order.push(revision_meta[ii].id);
        revision_meta[ii].el_tick = append_tick();
        if(!worker_has_revision.hasOwnProperty(revision_meta[ii].id)){
            r_to_get.push(revision_meta[ii])    
        }else{
            revision_meta[ii].el_tick.classList.add('downloaded');
        }
    }

    worker.postMessage({use_order: id_order});
    revision_meta[0].el_tick.classList.add('diffed'); // this is a bit of a hack - if we had rendered it as being diffed before we knew the lenght of the list it would look wrong
    render_download_status();
    render_for_settings();
    return r_to_get;

}

var send_revision_body_to_worker = function(revision_meta){
    return function(resp){
        if(resp.status !== 200)
            throw resp;
        worker.postMessage({revision: {
            id: revision_meta.id,
            body: decode_body(resp.body) /* fix utf-8 issues*/
            }});
        worker_has_revision[revision_meta.id] = true;
        revision_meta.el_tick.classList.add('downloaded');
        render_download_status();
        return true;
    }
}

var render_download_status = function(){
    var n_pending = 0;
    for(var ii=0;ii<revision_meta.length; ii++)
        if(!worker_has_revision.hasOwnProperty(revision_meta[ii].id))
            n_pending++;

    if(n_pending){
        el.info.textContent = "Downloaded " + (revision_meta.length - n_pending) 
                                        + " of " + revision_meta.length + "...";
    }else{
        el.info.textContent = "Downloaded all revisions.";
    }

}

var refresh_revisions_list = function(){
    // TODO: make this cancelable, with race
    el.info.textContent = "Updating revision list...";
    el.tick_box.innerHTML = "";
    el.at_range.max = 1;
    el.from_range.max = 1;
    el.at_range.value = 0;
    el.from_range.value = 0;
    at_idx = 0; 
    from_idx = 0;
    revision_meta = [{id: 'current',
                      el_tick: append_tick()}];
    revision_uses_line = [];
    worker.postMessage({reset_with_current_body: dn.editor.getSession().getValue()});
    worker_has_revision['current'] = true;
    revision_meta[0].el_tick.classList.add('downloaded');
    render_for_settings();

    // update the list of revisions, and prepare a list of ids to get bodies for
    until_success(function(succ, fail){
        Promise.all([dn.pr_auth, dn.pr_file_loaded])
               .then(dn.request_revision_list)
               .then(send_revisions_order_to_worker)
               .then(succ, fail);
    }).before_retry(dn.filter_api_errors)
    .catch(function(err){
        console.log("failed to update revisions list")
        dn.show_error(dn.api_error_to_string(err));
        throw(err);
    }).then(function(r_to_get){
        // download all the requested bodies...
        // note that annoyingly you cant use gapi batch-ing to do this
        var body_promises = []
        for(var ii=0; ii<r_to_get.length; ii++){
            body_promises.push(
                 until_success(function(ii, succ, fail){
                            Promise.resolve(dn.pr_auth)
                                   .then(dn.request_revision_body(r_to_get[ii].id))
                                   .then(send_revision_body_to_worker(r_to_get[ii]))
                                   .then(succ, fail);
                        }.bind(null, ii)) // need to bind ii, so that it's not the loop iterator object
                        .before_retry(dn.filter_api_errors)
                        .catch(function(err){
                            console.log("failed to download revision body")
                            dn.show_error(dn.api_error_to_string(err));
                            throw(err);
                        })
            ); // push    
        } // loop

        return Promise.all(body_promises)
           .then(function(res){
                console.log("got all bodies!!");
           }).catch(function(err){
                console.log("failed to get all bodies")
           });
    });
 
}


var date_str_to_local = function(d){
    // returns a 2-tuple of strings like ["11 Mar 2016", "11:45"]
    d = new Date(Date.parse(d));
    return [d.toLocaleDateString({}, {month:"short", day:"numeric", year: "numeric"}),
            d.toLocaleTimeString({}, {hour: "numeric", minute: "numeric"})];
}

var render_for_settings = function(){
    if(!dn.pr_file_loaded.is_resolved() || !editor) return;

    at_idx = parseInt(el.at_range.value);
    from_idx = parseInt(el.from_range.value);
    var at_meta = revision_meta[at_idx];
    var from_meta = revision_meta[from_idx];

    if(at_idx === 0){
        text_multi(el.caption_at, "Current\ndocument");
    } else {
        var at_time = date_str_to_local(at_meta.modifiedTime);
        text_multi(el.caption_at, at_time.join("\n"));
    } 

    if(from_idx === 0){
        text_multi(el.caption_from, "Current\ndocument");
    } else {
        var from_time = date_str_to_local(from_meta.modifiedTime);
        text_multi(el.caption_from, from_time.join("\n"));
    }

    // render as much as possible now, and request the rest to be delviered asap!
    var have_at = revision_uses_line[at_idx] !== undefined;
    var have_from = revision_uses_line[from_idx] !== undefined;
    if(have_at && have_from){
        if(at_idx === from_idx)
            render_single_revision(at_idx);
        else
           render_revision_pair(at_idx, from_idx);
    } else if(!have_at && have_from){
        render_single_revision(from_idx);
        worker.postMessage({uses_line: [at_idx]})
    } else if(have_at && !have_from){
        render_single_revision(at_idx);
        worker.postMessage({uses_line: [from_idx]})
    } else {
        worker.postMessage({uses_line: [from_idx, at_idx]});
    }


}

var render_removed_state = function(state){
    if(state){
        el.remove_expand.classList.add('selected');
        el.remove_collapse.classList.remove('selected');
    } else {
        el.remove_expand.classList.remove('selected');
        el.remove_collapse.classList.add('selected');
    }
    render_for_settings();
}


var on_document_ready = function(){
    el.remove_expand  = document.getElementById('revisions_remove_expand');
    el.remove_collapse  = document.getElementById('revisions_remove_collapse');
    el.info = document.getElementById('revision_info');
    el.info_overflow = document.getElementById('file_info_overflow');
    el.tick_box = document.getElementById('revision_tick_box');
    el.at_range = document.getElementById('revision_at_range');
    el.from_range = document.getElementById('revision_from_range');
    el.caption_at = document.getElementById('revision_caption_at');
    el.caption_from = document.getElementById('revision_caption_from');
    el.revisions_view = document.getElementById('revisions_view');
    el.ordered_list = document.getElementById('revisions_ordered_list');
    dn.g_settings.addEventListener('VALUE_CHANGED', function(e){
        if(e.property === 'historyRemovedIsExpanded')
            render_removed_state(e.newValue);
    });
      
    // controllers
    el.remove_expand.addEventListener('click', function(){
        dn.g_settings.set('historyRemovedIsExpanded', true);
    })
    el.remove_collapse.addEventListener('click', function(){
        dn.g_settings.set('historyRemovedIsExpanded', false);
    })

    el.at_range.addEventListener("input", render_for_settings);
    el.from_range.addEventListener("input", render_for_settings);
}


return {
    start: start,
    end: end,
    on_document_ready: on_document_ready,
    get_editor: get_editor,
    debug: function(){
        m = new Uint8Array(editor.session.doc.getLength());
        for(var i=0;i<m.length;i++)
            m[i] = Math.random() * 4;
        editor.show_rows(m);
        console.dir(m);
    }
};


})();
