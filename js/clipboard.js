"use strict";
/*
    Note that the find history list has its most recent entries at the 0-end, but
    the clipboard tool has its most recent entries at the other end.

*/
dn.clipboard_tool = (function(const_){

var is_active = false;
var showing_pane = false; // there is a delay after being active before we show the pane, note the public is_active method actually uses this value
var clipboard_index = -1;
var clipboard_info_timer = 0;

var document_clipboard_left = function(e){
    if(!is_active)
        return false;
    if(clipboard_index <= 0)
        return true;
    clipboard_index--;
    dn.editor.undo();
    dn.editor.insert(dn.g_clipboard.get(clipboard_index));
    return true;
}

var document_clipboard_right = function(e){
    if(!is_active)
        return false;

    dn.g_atomic_exec(function(){
        if(clipboard_index >= dn.g_clipboard.length-1)
            return true;
        clipboard_index++;
        dn.editor.undo();
        dn.editor.insert(dn.g_clipboard.get(clipboard_index));
    })
    return true;
}

var document_clipboard_keyup = function(e){
    if(e.which == 17 || e.which == 91 || !e.ctrlKey){
        document.removeEventListener('keyup', document_clipboard_keyup);
        is_active = false;
        if(showing_pane){
            showing_pane = false;
            dn.show_pane(dn.g_settings.get('pane'));
            dn.toggle_widget(dn.g_settings.get('pane_open'));
        }
        if(clipboard_info_timer){
            clearTimeout(clipboard_info_timer);
            clipboard_info_timer = null;
        }
    }
}

var on_paste = function(e){
    if (dn.g_clipboard === undefined)
        return; // don't bother implementing anything until cloud settings are properly loaded
    var text = e.text || "";
    is_active = true;    
    document.addEventListener('keyup', document_clipboard_keyup);
        
    clipboard_index = dn.g_clipboard.lastIndexOf(text); 
    if(clipboard_index == -1){ //it's possible the user copied some text from outside the DN, in which case we will add it to the clipboard now
        clipboard_index = dn.g_clipboard.push(text);
        if(dn.g_clipboard.length > const_.clipboard_max_length){
            clipboard_index--;
            dn.g_clipboard.remove(0);
        }
    }
    if(clipboard_info_timer)
        clearTimeout(clipboard_info_timer);

    clipboard_info_timer = setTimeout(function(){
        clipboard_info_timer = null;
        showing_pane = true; // this prevents g_settings 'pane_open' and 'pane' updates from being rendered
        dn.toggle_widget(true); // we can then temporarily exert manual control over the rendering of pane and pane_open
        dn.show_pane('pane_clipboard');
    }, const_.clipboard_info_delay);
}

var on_copy = function(text){
    if (dn.g_clipboard === undefined)
        return; // don't bother implementing anything until cloud settings are properly loaded
    text = text || "";
    dn.g_atomic_exec(function(){

        var previous_idx = dn.g_clipboard.lastIndexOf(text); 
        if(previous_idx === -1){
            // text is new, add it to the end of the clipboard
            dn.g_clipboard.push(text);
            if(dn.g_clipboard.length > const_.clipboard_max_length)
                dn.g_clipboard.remove(0);    
        }else{
            // the text already exists in the clipboard history, lets bring it to the front
            dn.g_clipboard.move(previous_idx, 0)
        }

    }); //g_atomic_exec

}


var on_document_ready = function(){
    dn.editor.on("paste", on_paste);
    dn.editor.on("copy", on_copy);
}


return {
    on_document_ready: on_document_ready,
    on_left:  document_clipboard_left, // this and...
    on_right:  document_clipboard_right, // this, are registered in keyboard.js
    is_active: function(){return showing_pane}
};

})(dn.const_);

