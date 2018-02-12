"use strict";
dn.find_pane = (function(const_){

var el = {};
var goto_input_has_focus = false; // we don't actually need this, but we keep it for analogy with search
var AceSearch;
var AceRange;
var search_inputs_have_focus = false; // either find itself or replace
var search_results = [];
var search_current_match_idx = -1;
var search_markers = [];
var search_marker_current = undefined;
var search_str = "";
var search_history_idx = -1; // when walking the find history this is >=0
var search_history_left_behind_str = ""; // although we call update_search_history after every change in search string, 
                                        // it won't always result in modifying the 0th entry in history, in such cases,
                                        // we record the actual string here so that we can come back to it if we walk the history
var search_history_last_modified_time = -1; // set each time we change the history



var focus_on_input = function(){
    if(dn.g_settings.get('find_goto'))
        el.goto_input.focus();
    else
        el.find_input.focus();
}

var on_document_ready = function(){
    AceSearch = ace.require("./search").Search;
    AceRange = ace.require("./range").Range;

    el.button_case_sensitive = document.getElementById('button_find_case_sensitive');
    el.button_whole_words = document.getElementById('button_find_whole_words');
    el.button_regex = document.getElementById('button_find_regex');
    el.find_input = document.getElementById('find_input');
    el.goto_input = document.getElementById('goto_input');
    el.replace_input = document.getElementById('find_replace_input');
    el.info = document.getElementById('find_info');
    el.search_results = document.getElementById('find_results');
    el.info_overflow = document.getElementById('find_info_overflow');
    el.button_goto = document.getElementById('button_goto');
    el.button_replace = document.getElementById('button_replace');
    el.goto_wrapper = document.getElementById('find_goto_wrapper');
    el.find_wrapper = document.getElementById('find_find_wrapper');
    el.replace_wrapper = document.getElementById('find_replace_wrapper');
    el.button_find_replace_all = document.getElementById('button_find_replace_all');

    dn.g_settings.addEventListener('VALUE_CHANGED', function(e){
        var new_value = e.newValue;
        switch(e.property){
            case 'find_regex':
            if(new_value)
                el.button_regex.classList.add('selected');
            else
                el.button_regex.classList.remove('selected');
            settings_changed();
            break;

            case 'find_whole_words':
            if(new_value)
                el.button_whole_words.classList.add('selected');
            else
                el.button_whole_words.classList.remove('selected');
            settings_changed();
            break;

            case 'find_case_sensitive':
            if(new_value)
                el.button_case_sensitive.classList.add('selected');
            else
                el.button_case_sensitive.classList.remove('selected');
            settings_changed();
            break;

            case 'find_replace':
            on_replace_toggled(new_value);
            break;

            case 'find_goto':
            on_goto_toggled(new_value);
            break;
        }
    })

    el.button_case_sensitive.addEventListener('click', function(){
        dn.g_settings.set('find_case_sensitive', !dn.g_settings.get('find_case_sensitive'));
    })
    el.button_whole_words.addEventListener('click', function(){
        dn.g_settings.set('find_whole_words', !dn.g_settings.get('find_whole_words'));
    })
    el.button_regex.addEventListener('click', function(){
        dn.g_settings.set('find_regex', !dn.g_settings.get('find_regex'));
    })
    el.goto_input.addEventListener('keydown', goto_input_keydown);
    el.goto_input.addEventListener('keyup', goto_input_keyup);
    el.goto_input.addEventListener('blur', goto_input_blur);
    el.goto_input.addEventListener('focus', goto_input_focus);
    el.find_input.addEventListener('keyup', find_input_keyup);
    el.find_input.addEventListener('keydown', find_input_keydown);
    el.find_input.addEventListener('blur', search_inputs_blur);
    el.find_input.addEventListener('focus', search_inputs_focus);
    el.replace_input.addEventListener('blur', search_inputs_blur);
    el.replace_input.addEventListener('focus', search_inputs_focus);
    el.replace_input.addEventListener('keydown', replace_input_keydown);
    el.button_find_replace_all.addEventListener('click', replace_all);
    el.button_replace.addEventListener('click', function(){
        dn.g_settings.set('find_replace', !dn.g_settings.get('find_replace'));
        dn.g_settings.set('find_goto', false);
        el.find_input.focus();
    })
    el.button_goto.addEventListener('click', function(){
        dn.g_settings.set('find_goto', !dn.g_settings.get('find_goto'));
        if(dn.g_settings.get('find_goto'))
            el.goto_input.focus();
        else
            el.find_input.focus();
    })
}

var find_shortcut_used = function(e){
    var sel = dn.editor.session.getTextRange(dn.editor.getSelectionRange());
    dn.g_settings.set('find_goto', false);
    dn.g_settings.set('pane', 'pane_find');
    dn.g_settings.set('pane_open', true);
    if(sel){
        if(sel !== search_str){
            search_str = sel;
            search_history_idx = -1;
            update_search_history();
        }
        el.find_input.value = sel;
        el.find_input.select();
    }
    el.find_input.focus();
    e.preventDefault();
}

var goto_shortcut_used = function(e){
    dn.g_settings.set('find_goto', true);
    dn.g_settings.set('pane', 'pane_find'); // doing this after the find_active=true, tells the change handler not to put focus back to editor
    dn.g_settings.set('pane_open', true);
    el.goto_input.focus();
    e.preventDefault();
}

var replace_shortcut_used = function(e){
    dn.g_settings.set('find_replace', true);
    find_shortcut_used(e);   
}

var on_goto_toggled = function(new_value){
    // This just toggles the display, it does not deal with focus/blur, which may happen afterwards
    // as a consequence if the relevant inputs previously had the focus.

    if(new_value){
        el.goto_wrapper.style.display = '';
        el.find_wrapper.style.display = 'none';
        el.button_goto.classList.add('selected');
        el.info.textContent = 'goto line inactive';
        el.replace_wrapper.style.display = 'none';
    }else{
        el.goto_wrapper.style.display = 'none';
        el.find_wrapper.style.display = '';
        el.button_goto.classList.remove('selected');
        el.info.textContent = 'search inactive';
        if (dn.g_settings.get('find_replace'))
            el.replace_wrapper.style.display = '';
    }
}

var on_replace_toggled = function(new_value){
    if(new_value){
        el.button_replace.classList.add('selected');
        if(!dn.g_settings.get('find_goto'))
            el.replace_wrapper.style.display = '';
    }else{
        el.replace_wrapper.style.display = 'none';
        el.button_replace.classList.remove('selected');
    }
    if(search_inputs_have_focus)
        select_search_result_idx(search_current_match_idx);
}

// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// goto :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// the implementation of goto is simpler than for search, so we start with it...

var goto_input_focus = function(){
    goto_input_has_focus = true;
    el.info.textContent = "type to goto line";
    perform_goto();
}

var goto_input_blur = function(e){
    goto_input_has_focus = false;
    el.info.textContent = "goto line inactive"; 
    //if(!e.relatedTarget)
    //    dn.focus_editor();
}

var perform_goto = function(){
    // called by find_goto_input_focus and find_goto_keyup
    var validated_str = el.goto_input.value.replace(/[^\d]/,'');
    if (validated_str !== el.goto_input.value)
        el.goto_input.value = validated_str;
    if(validated_str === "")
        return;
    var num = parseInt(validated_str);
    dn.editor.gotoLine(num);
    dn.editor.navigateLineEnd();
}

var goto_input_keyup = perform_goto; //alias

var goto_input_keydown = function(e){
    // keydown is fired repeatedly when key remains down
    if(e.which == WHICH.DOWN){
        el.goto_input.value = parseInt(el.goto_input.value.replace(/[^\d]/,''))+1;
        perform_goto();
        e.preventDefault();
    }else if(e.which == WHICH.UP){
        el.goto_input.value = parseInt(el.goto_input.value.replace(/[^\d]/,''))-1;
        perform_goto();
        e.preventDefault();
    } else if(e.which == WHICH.ESC){
        dn.g_settings.set('pane_open', false);
        e.preventDefault();
        e.stopPropagation();
        dn.focus_editor();
    }
}


// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// search :::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::
// ::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::::

    
var update_search_history = function(){
    // called when the user types in the search box, or when we launch find from shortcut with selection
    var current_str = search_str;
    search_history_left_behind_str = current_str;

    if(current_str.length === 0 || !dn.g_atomic_exec){   
        search_history_idx = -1;
        return;
    }

    dn.g_atomic_exec(function(){
        var time_now = Date.now();

        if(dn.g_find_history.length === 0){
            // create a history entry for the first ever time
            dn.g_find_history.push(current_str);
            search_history_idx = 0;
            search_history_last_modified_time = time_now;
            return;
        }

        var top_of_history = dn.g_find_history.get(0);

        if(current_str.length<top_of_history.length 
           && current_str.toLowerCase() === top_of_history.substr(0, current_str.length).toLowerCase()){
            // current string is a case-insensitive prefix of top_of_history, leave top_of_history as it was
            search_history_idx = -1;
            return;
        }

        if(current_str.toLowerCase()==top_of_history.toLowerCase()){
            //case insensitive match, update top_of_history to have same case as current
            dn.g_find_history.set(0, current_str);
        }else if(current_str.length>top_of_history.length 
           && top_of_history.toLowerCase() === current_str.substr(0, top_of_history.length).toLowerCase()){
            // top_of_history is a case-insensitive prefix of current_str, replace top_of_history with current
            dn.g_find_history.set(0, current_str);
        } else if(time_now > search_history_last_modified_time + dn.const_.find_history_add_delay){
            // it's been a while since changes were made, add the current string as the new top
            dn.g_find_history.insert(0, current_str);
            if(dn.g_find_history.length > dn.const_.find_history_max_len){
                dn.g_find_history.remove(dn.g_find_history.length-1);
            }
        } else {
            // although the current string is at least somewhat different to the top, it's not been that
            // long since we modified the top, so lets just replace it with the new string
            dn.g_find_history.set(0, current_str);
        }
        search_history_idx = 0;
        search_history_last_modified_time = time_now;

        // TODO: we may like to remove duplicates in history, but without allowing recall to obliterate lots of existing memories

    }); // g_atomic_exec
}


var search_inputs_focus = function(e){
    if(e.currentTarget == el.find_input){
        el.find_input.tabIndex = 101;
        el.replace_input.tabIndex = 102;   
    } else {
        el.find_input.tabIndex = 102;
        el.replace_input.tabIndex = 101;   
    }
    if(search_inputs_have_focus)
        return; // focus was transfered between replace/find inputs

    search_inputs_have_focus = true;
    dn.editor.setHighlightSelectedWord(false);  
    perform_search();
}

var search_inputs_blur = function(e){
    if(e.relatedTarget == el.replace_input  || e.relatedTarget == el.find_input)
        return; // focus is transfering between replace/find inputs
    search_inputs_have_focus = false;

    // remove all search_markers
    var session = dn.editor.getSession();   
    for(var ii=0; ii<search_markers.length; ii++)
        session.removeMarker(search_markers[ii]);
    if (search_marker_current !== undefined){
        session.removeMarker(search_marker_current);
        search_marker_current = undefined;
    }

    // reset widget display
    el.info.textContent = "search inactive";
    el.search_results.innerHTML = "";
    el.info_overflow.textContent = "";

    // forget last search
    search_markers = [];
    search_results = [];
    search_current_match_idx = -1;

    // forget last selection in input (in preparation for next time it gets focus)
    // TODO: in IE11 this brings the focus back to the bluring element which isn't what we wanted at all
    el.find_input.setSelectionRange(el.find_input.selectionEnd, el.find_input.selectionEnd);

     // we had this on false during find
    dn.editor.setHighlightSelectedWord(true);

    //if(!e.relatedTarget)
    //        dn.focus_editor();
}

var build_search_options = function(){
    var str = el.find_input.value;
    var use_reg_exp = dn.g_settings.get('find_regex');
    var sensitive = dn.g_settings.get('find_case_sensitive');
    if(use_reg_exp){
        var re = undefined;
        re = new RegExp(str, sensitive ? "g" : "gi"); //cam throw error
    }
    return {
    needle: use_reg_exp ? re : str,
    wrap: true,
    caseSensitive: sensitive,
    wholeWord: dn.g_settings.get('find_whole_words'),
    regExp: use_reg_exp };
}

var perform_search = function(){
    // called by find_input_focus, find_settings_changed, and on keyup in the input, when text has changed

    // clear previous find (but leave selection for now)
    var session = dn.editor.getSession();   
    for(var ii=0; ii<search_markers.length; ii++)
        session.removeMarker(search_markers[ii]);
    if(search_marker_current !== undefined){
        session.removeMarker(search_marker_current)
        search_marker_current = undefined;
    }
    search_markers = [];
    search_results = [];
    search_current_match_idx = -1;
    el.search_results.innerHTML = "";  
    el.info_overflow.textContent = "";
    el.info.textContent = "";
    search_str = el.find_input.value; // we only store it to make it easier for key_down to check for true changes

    var search_options = undefined;
    try{
        search_options = build_search_options();
    } catch (e){
        el.info.textContent = escape_str(e.message); //TODO: could force first letter to lower case
    }

    if(search_options === undefined){
        // failed regex, don't show any search_results
        dn.editor.selection.clearSelection();

    } else if(search_str == ""){
        // empty string (including empty regex), dont show any search_results
        el.info.textContent = "type to search. " /*+ dn.ctrl_key + "-up/down for history."*/;
        dn.editor.selection.clearSelection();
        
    } else {
        // valid regex or pure search_str search..

        // This is the actual search
        var search = new AceSearch();
        search.setOptions(search_options);
        search_results = search.findAll(session);

        if(search_results.length === 0){
            // No search_results to display, life is easy...
            el.info.textContent = "no matches found.";
            el.info_overflow.textContent = "";
            dn.editor.selection.clearSelection();

        }else{
            // Right, we got some search_results ....

            // Work out which result we should consider the current match.
            var selected_range = session.getSelection().getRange();
            for(var ii=0; ii<search_results.length; ii++) 
                if(search_results[ii].end.row > selected_range.start.row  || 
                    (search_results[ii].end.row == selected_range.start.row &&
                     search_results[ii].end.column >= selected_range.start.column))
                break;
            var current_match_idx = (ii == search_results.length ? search_results.length-1 : ii);

            // Add search_markers into the editor to show *all* the search_results
            for(var ii=0; ii<search_results.length; ii++)
                search_markers.push(session.addMarker(search_results[ii], "find_match_marker", "find_match_marker", false));

            // augment the search_results with their idx, this is useful for the subselection stuff
            for(var ii=0; ii<search_results.length; ii++)
                search_results[ii] = {range: search_results[ii], idx: ii};

            // Render a subset of the search_results into the widget and mark & select the current match
            select_search_result_idx(current_match_idx);
        }
    }

}

var select_search_result_idx = function(new_idx){
    // This is called within find_perform_search when a new search returns some search_results
    // it's also called when we move through the search_results without changing the search and
    // when replace_changed is called when find input already has the focus.   */

    // Get a small sub set of search_results to show in the widget.
    // We carefully implement some wrapping logic, which is a bit fiddly.
    search_current_match_idx = new_idx;

    var session = dn.editor.getSession();
    if (search_marker_current !== undefined){
        session.removeMarker(search_marker_current);
        search_marker_current = undefined;
    }

    var search_results_sub = [];
    
    var replace_is_showing = dn.g_settings.get('find_replace');

    var max_search_results = const_.find_max_results_half*2 + (replace_is_showing ? 0 : 1);

    if(search_results.length <= max_search_results){
        search_results_sub = search_results;
    }else{
        var n_pre = const_.find_max_results_half - (replace_is_showing ? 1 : 0);
        var n_post = const_.find_max_results_half;
        if(search_current_match_idx < n_pre){
            search_results_sub = search_results_sub.concat(search_results.slice(search_current_match_idx - n_pre));
            search_results_sub = search_results_sub.concat(search_results.slice(0, search_current_match_idx));
        } else {
            search_results_sub = search_results_sub.concat(search_results.slice(search_current_match_idx - n_pre, search_current_match_idx));
        }
        search_results_sub.push(search_results[search_current_match_idx]); 
        if(search_current_match_idx + n_post >= search_results.length){
            search_results_sub = search_results_sub.concat(search_results.slice(search_current_match_idx + 1));
            search_results_sub = search_results_sub.concat(search_results.slice(0, n_post + 1 - (search_results.length - search_current_match_idx)));
        } else {
            search_results_sub = search_results_sub.concat(search_results.slice(search_current_match_idx + 1, search_current_match_idx + n_post + 1));
        }
    }

    // Now lets build the html to show the subset of search_results in the widget
    var show_replace_buttons = dn.g_settings.get('find_replace');
    var html = "";
    for(var ii=0; ii<search_results_sub.length; ii++){
        var row = search_results_sub[ii].range.start.row;
        var col = search_results_sub[ii].range.start.column;
        var prefix_range = new AceRange(row, Math.max(0, col-const_.find_max_prefix_chars), row, col);
        var pre_ellipses = col > const_.find_max_prefix_chars; //TODO: deal with indent better
        row = search_results_sub[ii].range.end.row;
        col = search_results_sub[ii].range.end.column;
        var suffix_range = new AceRange(row, col, row, col+const_.find_max_suffix_chars);
        html += "<div class='find_result_item" + (search_results_sub[ii].idx==search_current_match_idx? " find_result_current" : "") + "'>" +
                    "<div class='find_result_line_num'>" + (row+1) + "</div>" +
                    "<div class='find_result_text'>" +
                        "<div class='find_result_text_inner'>" +
                            (pre_ellipses ? "&#8230;" : "") + escape_str(session.getTextRange(prefix_range)) +
                            "<span class='find_result_match'>" + escape_str(session.getTextRange(search_results_sub[ii].range)) + "</span>" +
                            escape_str(session.getTextRange(suffix_range)) +
                        "</div>" +
                    "</div>" +
                    (show_replace_buttons ? "<div class='button inline_button replace_single_result' title='replace'>r</div>" : "") + 
                "</div>";
    }
    el.search_results.innerHTML = html;
    var els = el.search_results.getElementsByClassName('find_result_item');
    for(var ii=0; ii<els.length; ii++) if(search_results_sub[ii].idx !== search_current_match_idx)
        els[ii].addEventListener('click', search_result_click(search_results_sub[ii].idx));
    if(show_replace_buttons){
        var els = el.search_results.getElementsByClassName('replace_single_result')
        for(var ii=0; ii<els.length; ii++)
            els[ii].addEventListener('click', search_replace_result_click(search_results_sub[ii].idx));
    }

    if(search_results.length > max_search_results)
        el.info_overflow.textContent = "... and " + (search_results.length - max_search_results) + " more matches";
    else
        el.info_overflow.textContent = "";

    // do the special marker for the current selection and actually select it
    search_marker_current = session.addMarker(search_results[search_current_match_idx].range, "find_current_match_marker", "find_current_match_marker", false);
    dn.editor.selection.setSelectionRange(search_results[search_current_match_idx].range, false);
    dn.editor.renderer.scrollSelectionIntoView();
}

var settings_changed = function(){
    if(search_inputs_have_focus || 
       (dn.g_settings.get('pane') === 'pane_find' && dn.g_settings.get('pane_open') &&  el.find_input.value))
        perform_search();
}

var search_result_click = function(ii){
    // this can only be called while find input has the focus
    return function(e){select_search_result_idx(ii);};
}

var search_replace_result_click = function(ii){
    return function(e){
        replace_result_idx(ii);
        e.stopPropagation(); // prevent selecting item
    }
}

var find_input_keyup = function(e){ 
    //we need keyup here in order that the val has the new character or new backspace
    if(e.which == WHICH.ENTER || e.which == WHICH.ESC || e.which == WHICH.UP || e.which == WHICH.DOWN)
        return; 
    if(search_str == el.find_input.value)
        return;
    perform_search();
    update_search_history();
}

var find_input_keydown = function(e){ 
    // we want keydown here so that we can get repeated firing with keydown (i think on most browsers)

    if ((e.which == WHICH.ENTER && !e.shiftKey) || (!e.ctrlKey && e.which == WHICH.DOWN)){
        //find next
        select_search_result_idx(search_current_match_idx + 1 < search_results.length ? 
                                    search_current_match_idx + 1 
                                  : 0);
        e.preventDefault();
        return;
    }else if((e.which == WHICH.ENTER && e.shiftKey) || (!e.ctrlKey && e.which == WHICH.UP)){
        //find previous
        select_search_result_idx(search_current_match_idx - 1 < 0 ? 
                                    search_results.length -1 
                                  : search_current_match_idx - 1);
        e.preventDefault();
        return;
    }

    if(e.which == WHICH.ESC){
        dn.g_settings.set('pane_open', false); // blurs the find_input
        dn.focus_editor();
        e.preventDefault();
        e.stopPropagation();
        return;   
    }

    if(e.ctrlKey && dn.g_find_history && (e.which == WHICH.DOWN || e.which == WHICH.UP)){
        dn.g_atomic_exec(function(){
            if(e.which == WHICH.UP) // up means go to more recent item
               search_history_idx = Math.max(-1, search_history_idx-1);
            else // down means move further into the past
               search_history_idx++;
           search_history_idx = Math.min(search_history_idx, dn.g_find_history.length-1);
           if(search_history_idx == -1){
                el.find_input.value = search_history_left_behind_str;
           }else{
                el.find_input.value = dn.g_find_history.get(search_history_idx);
           }
           el.find_input.setSelectionRange(el.find_input.value.length, el.find_input.value.length+10);
        });
        perform_search();
        e.preventDefault();
    }

}

var replace_input_keydown = function(e){
    if(e.which == WHICH.ENTER){
        if(e.ctrlKey || e.shiftKey)
            replace_all();
        else
            replace_result_idx(search_current_match_idx);
        e.preventDefault();
    }else{
        find_input_keydown(e); // up, down search_results and esc
    }
}

var replace_all = function(e){
    try{
        var options = build_search_options();
    } catch (e) {
        dn.show_error(e.message);
        return;
    }
    dn.editor.replaceAll(el.replace_input.value, options);
    dn.focus_editor();
}

var replace_result_idx = function(idx){
    var range = search_results[idx].range;
    // we use undocumented ACE API to avoid messing around tryinng to force it to use the exact range we wanted
    dn.editor.$search.set(build_search_options()); //this is needed so that $tryReplace knows what to do with regex'es
    dn.editor.$tryReplace(range, el.replace_input.value) // returns true on success, but do we care?
    perform_search();
}





return {
    focus_on_input: focus_on_input,
    on_document_ready: on_document_ready,
    on_find_shortcut: find_shortcut_used,
    on_replace_shortcut: replace_shortcut_used,
    on_goto_shortcut: goto_shortcut_used
}

})(dn.const_);