"use strict";



dn.esc_pressed = function(e){
    dn.g_settings.set('pane_open', !dn.g_settings.get('pane_open'));

    if(dn.g_settings.get('pane_open') && dn.g_settings.get('pane') == 'pane_find'){
        dn.find_pane.focus_on_input();
    }else{
        dn.focus_editor();
    }
    e.preventDefault();
}

dn.make_keyboard_shortcuts = function(){
    //perviously was using ace for handling these shorcuts because it neater (and efficient?) but it was
    //annoying trying to ensure the editor always had focus, and not clear what to do when the editor wasn't showing.
    
    //we have to delete the default ace commands linked to the keys we care about
    dn.editor.commands.removeCommands([
        "find","findprevious","findnext","replace","jumptomatching","sortlines","selecttomatching","gotoline"]);

    //then add new commands on to the document using keymaster.js...
    key('command+s, ctrl+s,  ctrl+alt+s,  command+alt+s', dn.file_pane.on_save_shorcut);
    key('command+p, ctrl+p,  ctrl+alt+p,  command+alt+p', dn.file_pane.do_print_shorcut);
    key('command+o, ctrl+o,  ctrl+alt+o,  command+alt+o', dn.do_open);
    key('command+n, ctrl+n,  ctrl+alt+n,  command+alt+n', dn.do_new);
    key('command+l, ctrl+l,  ctrl+alt+l,  command+alt+l', dn.find_pane.on_goto_shortcut);
    key('command+f, ctrl+f,  ctrl+alt+f,  command+alt+f', dn.find_pane.on_find_shortcut); 
    key('command+r, ctrl+r,  ctrl+alt+r,  command+alt+r' + 
       ', command+g, ctrl+g,  ctrl+alt+g,  command+alt+g', dn.find_pane.on_replace_shortcut);
    key('command+h, ctrl+h,  ctrl+alt+h,  command+alt+h', dn.file_pane.do_history);
    key('esc', dn.esc_pressed);
    key.filter = function(){return 1;}

    // it seems like the clipboard history cycling only works the old way, i.e. using ace....
    var HashHandler = require("ace/keyboard/hash_handler").HashHandler
    var extraKeyEvents = new HashHandler([
        {bindKey: {win: "Ctrl-Left",mac: "Command-Left"}, descr: "Clipboard cyle back on paste", exec: dn.clipboard_tool.on_left},
        {bindKey: {win: "Ctrl-Down",mac: "Command-Down"}, descr: "Clipboard cyle back on paste", exec: dn.clipboard_tool.on_left},
        {bindKey: {win: "Ctrl-Right",mac:"Command-Right"}, descr: "Clipboard cyle forward on paste", exec: dn.clipboard_tool.on_right},
        {bindKey: {win: "Ctrl-Up",mac:"Command-Up"}, descr: "Clipboard cyle forward on paste", exec: dn.clipboard_tool.on_right}
    ]);
    dn.editor.keyBinding.addKeyboardHandler(extraKeyEvents);

    // Change "ctrl" to "cmd" if on Mac
    dn.ctrl_key = "crtl"
    if(dn.platform == 'Mac'){
        dn.ctrl_key = 'cmd';
        var els = document.getElementsByClassName('ctrl_key');
        for(var ii=0; ii<els.length; ii++)
            els[ii].textContent = 'cmd'
    }
}
