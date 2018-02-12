"use strict";
dn.file_pane = (function(){

// this uses an MVC paradigm, with the model described in file_model.js

var el = {};

var history_active = false;

// non-MVC functions ::::::::::::::::::::::::::::::::::

var do_save = function (e){
    e.preventDefault(); //needed for when called as shortcut
    if(dn.the_file.is_read_only)
        return dn.show_error("Cannot save read-only file.");
    dn.save({body: dn.editor.getSession().getValue()});
}

var read_only_bail = function(e){
    dn.show_error("The file is read-only, so you cannot change its properties.");
    e.preventDefault(); // probably redundant here
}

var on_title_begin_edit = function(e){  
    if(dn.the_file.is_read_only)
        return read_only_bail(e);  
    el.title_text.style.display = 'none';
    el.title_input.style.display = '';
    el.title_input.focus();
    el.title_input.select();
}

var on_title_keydown = function(e){
    if(e.which == WHICH.ESC){
        el.title_input.value = dn.the_file.title;
        e.stopPropagation();
        dn.focus_editor();
    }else if(e.which === WHICH.ENTER){
        e.preventDefault();
        dn.focus_editor(); // calls blur
    }
}

var on_description_begin_edit =function(e){  
    if(dn.the_file.is_read_only)
        return read_only_bail(e);  
    el.description_text.style.display = 'none';
    el.description_input.style.display = '';
    el.description_input.focus();
    el.description_input.select();
}

var on_description_keydown = function(e){
    if(e.which == WHICH.ESC){
        el.description_input.value = dn.the_file.description;
        e.stopPropagation();
        dn.focus_editor();
    } else if(e.which === WHICH.ENTER  && !e.ctrlKey && !e.shiftKey){
        e.preventDefault();
        dn.focus_editor(); // calls blur
    }
}

var do_share = function(){
    Promise.resolve(dn.pr_file_loaded)
           .then(function(){
        dn.status.file_sharing = -1; //TODO: see SO question about no callback for share dialog...how are we supposed to know when it's closed and what happened?
        dn.the_file.is_shared = 0;
        dn.show_status();

        if(el.share_dialog){
            do_share_sub();
        } else {
            gapi.load('drive-share', function(){
                el.share_dialog = new gapi.drive.share.ShareClient(dn.client_id);
                do_share_sub();
            });
        }
    });
}

var do_share_sub = function(){
    el.share_dialog.setItemIds([dn.the_file.file_id]);
    el.share_dialog.setOAuthToken(gapi.auth.getToken().access_token);
    el.share_dialog.showSettingsDialog();
}

var do_print = dn.do_print;


// controler functions ::::::::::::::::::::::::::::::::::

var on_description_end_edit = function(){
    el.description_input.style.display = 'none';
    el.description_text.style.display = '';
    var new_val = el.description_input.value;
    if(dn.the_file.description !== new_val){
        dn.the_file.set({description: new_val});    
        dn.save({description: new_val});
    }
    dn.focus_editor();
}

var on_title_end_edit = function(){
    el.title_input.style.display = 'none';
    el.title_text.style.display = '';
    var new_val = el.title_input.value;
    if(dn.the_file.title !== new_val){
        dn.the_file.set({title: new_val});
        dn.save({title: new_val});
    }
    dn.focus_editor();
}

var on_newline_click = function(e){
    if(dn.the_file.is_read_only)
        return read_only_bail(e);  

    var val = "detect";
    if(e.currentTarget === el.newline_unix)
        val = "unix";
    else if (e.currentTarget === el.newline_windows)
        val = "windows";
    dn.the_file.set({newline: val});
    dn.save({newline: val});
}

var on_syntax_detect_click = function(e){
    if(dn.the_file.is_read_only)
        return read_only_bail(e);  

    dn.the_file.set({syntax: "detect"});
    dn.save({syntax: "detect"});
}

var on_syntax_dropdown_click = function(e){
    if(dn.the_file.is_read_only)
        return read_only_bail(e);  

    var val =  syntax_drop_down.GetVal();
    dn.save({syntax: val}); 
    dn.the_file.set({syntax: val});
}

var on_tab_click = function(e){
    if(dn.the_file.is_read_only)
        return read_only_bail(e);  

    var val = {val: "detect"};

    if (e.currentTarget === el.tab_soft_inc){
        e.stopPropagation();
        val = {val: "spaces",
               n: Math.min(dn.the_file.properties_chosen.tabs.n + 1, dn.const_.max_soft_tab_n)};
    } else if (e.currentTarget === el.tab_soft_dec){
        e.stopPropagation();
        var n = dn.the_file.properties_chosen.tabs.n - 1;
        val = {val: "spaces",
               n: Math.max(dn.the_file.properties_chosen.tabs.n - 1, dn.const_.min_soft_tab_n)};
    }else if(e.currentTarget === el.tab_soft){
        val = {val: "spaces", n: dn.the_file.properties_chosen.tabs.n};
    } else if(e.currentTarget === el.tab_hard){
        val = {val: "tab", n: dn.the_file.properties_chosen.tabs.n};
    }

    dn.the_file.set({tabs: val});
    dn.save({tabs: JSON.stringify(val)});
}

// view functions ::::::::::::::::::::::::::::::::::

var render_title = function(){
    el.title_text_inner.textContent = dn.the_file.title;
    el.title_input.value = dn.the_file.title;
}

var render_description = function(){
    text_multi(el.description_text_inner, dn.the_file.description, true);
    el.description_input.value = dn.the_file.description;
}

var render_newline = function(){
    el.newline_detect.classList.remove('selected');
    el.newline_windows.classList.remove('selected');
    el.newline_unix.classList.remove('selected');
    var val =  dn.the_file.properties.newline;
    if(val === "detect")
        el.newline_detect.classList.add('selected');
    else if(val === "windows")
        el.newline_windows.classList.add('selected');
    else
        el.newline_unix.classList.add('selected');   
    el.newline_info.textContent = dn.the_file.properties_detected_info.newline; 
}

var render_syntax = function(){
    syntax_drop_down.SetInd(syntax_drop_down.IndexOf(dn.the_file.properties_chosen.syntax), true);
    if(dn.the_file.properties.syntax === "detect"){
        el.ace_mode_detect.classList.add('selected');
        syntax_drop_down.SetSelected(false);
    }else{
        el.ace_mode_detect.classList.remove('selected');
        syntax_drop_down.SetSelected(true);
    }
    el.ace_mode_info.textContent = dn.the_file.properties_detected_info.syntax;
}

var render_tabs = function(){
    var user_tabs = dn.the_file.properties.tabs;

    el.tab_soft.classList.remove('selected');
    el.tab_hard.classList.remove('selected');
    el.tab_detect.classList.remove('selected');

    if(user_tabs.val === "tab")
        el.tab_hard.classList.add('selected');
    else if(user_tabs.val === "spaces")
        el.tab_soft.classList.add('selected');
    else
        el.tab_detect.classList.add('selected');
    
    el.tab_soft_text.textContent = dn.the_file.properties_chosen.tabs.n;
    el.tab_info.textContent = dn.the_file.properties_detected_info.tabs;
}

var end_history = function(){
    if(!history_active)
        return;
    dn.history_tool.end();
    el.button_history.classList.remove('selected');
    el.button_save.style.display = '';
    el.button_print.style.display = '';
    el.inner_pane_history.style.display = 'none';
    el.inner_pane_main.style.display = '';
    history_active = false;
}

var do_history = function(){
    Promise.resolve(dn.pr_file_loaded)
        .then(function(){
            el.button_history.classList.add('selected');
            el.button_save.style.display = 'none';
            el.button_print.style.display = 'none';
            el.inner_pane_history.style.display = '';
            el.inner_pane_main.style.display = 'none';
            dn.history_tool.start();
            history_active = true;            
        });
}

var syntax_drop_down;

var register_controllers = function(){
    // We wait until the file model is loaded before registering all these controllers.
    // Note that when creating a new file, the file model is said to be loaded before
    // we get the file_id back from the server, that is because we don't need to wait
    // for the server to tell us about existing metadata.  In this pre-file_id state,
    // we can issue save requests because the save machienery knows to queued them
    // up until it the file_id is available.

    // title and description

    el.title_text.addEventListener('click', on_title_begin_edit) 
    el.title_input.addEventListener("blur", on_title_end_edit); 
    el.title_input.addEventListener('keydown', on_title_keydown);

    el.description_text.addEventListener('click', on_description_begin_edit) 
    el.description_input.addEventListener("blur", on_description_end_edit); 
    el.description_input.addEventListener('keydown', on_description_keydown);

    // File custom props stuff, make use of currentTarget to identify src

    el.newline_detect.addEventListener('click', on_newline_click);
    el.newline_windows.addEventListener('click', on_newline_click);
    el.newline_unix.addEventListener('click', on_newline_click);

    el.tab_detect.addEventListener('click', on_tab_click);
    el.tab_hard.addEventListener('click', on_tab_click);
    el.tab_soft_inc.addEventListener('click', on_tab_click);
    el.tab_soft_dec.addEventListener('click', on_tab_click);
    el.tab_soft.addEventListener('click', on_tab_click); // propagation is stopped if inc or dec are clicked rather than the base button

    el.ace_mode_detect.addEventListener('click', on_syntax_detect_click);  
    syntax_drop_down.enabled = true;  
    syntax_drop_down.addEventListener("click", on_syntax_dropdown_click);
    syntax_drop_down.addEventListener("change", on_syntax_dropdown_click);

    // File action buttons stuff
    el.button_save.addEventListener('click', do_save);
    el.button_print.addEventListener('click', do_print);
    el.button_share.addEventListener('click', do_share);
    el.button_history.addEventListener('click', function(){
        if(history_active)
            end_history();
        else 
            do_history();
    });
}

var on_document_ready = function(){
    el.title_input  = document.getElementById('details_file_title_input');
    el.title_text = document.getElementById('details_file_title_text');
    el.title_text_inner = document.getElementById('details_file_title_text_inner');
    el.description_input  = document.getElementById('details_file_description_input');
    el.description_text = document.getElementById('details_file_description_text');    
    el.description_text_inner = document.getElementById('details_file_description_text_inner');    
    el.ace_mode_choose = document.getElementById('file_ace_mode_choose')
    el.ace_mode_detect = document.getElementById('file_ace_mode_detect');
    el.ace_mode_info = document.getElementById('file_ace_mode_info');
    el.newline_detect = document.getElementById('file_newline_detect');
    el.newline_windows = document.getElementById('file_newline_windows');
    el.newline_unix = document.getElementById('file_newline_unix');
    el.newline_info = document.getElementById('file_newline_info');
    el.tab_detect = document.getElementById('file_tab_detect');
    el.tab_soft_inc = document.getElementById('file_tab_soft_inc');
    el.tab_soft_dec = document.getElementById('file_tab_soft_dec');
    el.tab_hard = document.getElementById('file_tab_hard');
    el.tab_soft = document.getElementById('file_tab_soft');
    el.tab_soft_text = document.getElementById('file_tab_soft_text');
    el.tab_info = document.getElementById('file_tab_info');
    el.button_save = document.getElementById('button_save');
    el.button_print = document.getElementById('button_print');
    el.button_share = document.getElementById('button_share');
    el.button_history = document.getElementById('button_history'); 
    el.inner_pane_main = document.getElementById('pane_file_main');    
    el.inner_pane_history = document.getElementById('pane_file_history');    
        
    var modes = require("ace/ext/modelist").modes;    
    syntax_drop_down = new DropDown(modes.map(function(m){return m.caption;}));
    syntax_drop_down.enabled = false;
    el.ace_mode_choose.appendChild(syntax_drop_down.el);  

    dn.history_tool.on_document_ready();

    dn.the_file.addEventListener('change', function(e){
        switch(e.property){
            case "syntax":
            render_syntax();
            break;

            case "newline":
            render_newline();
            break;

            case "tabs":
            render_tabs();
            break;

            case "title":
            render_title();
            break;

            case "description":
            render_description();
            break;

            case "is_loaded":
            register_controllers();
            break;
        }
    })

}



return {
    on_save_shorcut: do_save,
    on_print_shortcut: do_print,
    on_document_ready: on_document_ready,
    on_close_pane: end_history,
    do_history: function(e){
        e.preventDefault();
        dn.g_settings.set('pane', 'pane_file');
        dn.g_settings.set('pane_open', true);
        do_history();
    }
}



})();