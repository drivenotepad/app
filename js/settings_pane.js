"use strict";

dn.settings_pane = (function(){

var el = {};

var theme_drop_down;

var on_document_ready = function(){
    el.theme_chooser = document.getElementById('theme_chooser')
    el.button_clear_clipboard = document.getElementById("button_clear_clipboard");
    el.button_clear_find_replace = document.getElementById("button_clear_find_replace");
    el.gutter_history_show = document.getElementById('gutter_history_show');
    el.gutter_history_hide = document.getElementById('gutter_history_hide');
    el.word_wrap_off = document.getElementById('word_wrap_off');
    el.word_wrap_at = document.getElementById('word_wrap_at');
    el.word_wrap_edge = document.getElementById('word_wrap_edge');
    el.font_size_dec = document.getElementById('font_size_dec');
    el.font_size_inc = document.getElementById('font_size_inc');
    el.font_size_text = document.getElementById('font_size_text');
    el.tab_hard = document.getElementById('tab_hard');
    el.tab_soft = document.getElementById('tab_soft');
    el.newline_windows = document.getElementById('newline_menu_windows');
    el.newline_unix = document.getElementById('newline_menu_unix');
    el.tab_soft_text = document.getElementById('tab_soft_text');
    el.tab_soft_dec = document.getElementById('tab_soft_dec');
    el.tab_soft_inc = document.getElementById('tab_soft_inc');
    el.word_wrap_at_text = document.getElementById('word_wrap_at_text');
    el.word_wrap_at_dec = document.getElementById('word_wrap_at_dec');
    el.word_wrap_at_inc = document.getElementById('word_wrap_at_inc');

    dn.g_settings.addEventListener("VALUE_CHANGED", on_change); // this does all the view rendering

    var themes = require('ace/ext/themelist');
    theme_drop_down = new DropDown(Object.keys(themes.themesByName));

    // annonymous controler functions....
    theme_drop_down.addEventListener("change",function(){
        dn.g_settings.set("theme",theme_drop_down.GetVal());
    })
    theme_drop_down.addEventListener("blur",function(){
       dn.focus_editor();
    })
    el.theme_chooser.appendChild(theme_drop_down.el);
    el.newline_windows.addEventListener('click', function(){
        dn.g_settings.set('newLineDefault', 'windows');
    });
    el.newline_unix.addEventListener('click', function(){
        dn.g_settings.set('newLineDefault', 'unix');
    });
    el.tab_hard.addEventListener('click', function(){
        dn.g_settings.set('tabIsHard', 1)
    });
    el.tab_soft.addEventListener('click', function(){
        dn.g_settings.set('tabIsHard', 0);
    });
    el.tab_soft_dec.addEventListener('click', function(){
        var at = dn.g_settings.get('softTabN') - 1;
        at = at < dn.const_.min_soft_tab_n ? dn.const_.min_soft_tab_n : at;
        dn.g_settings.set('softTabN',at);
    });
    el.tab_soft_inc.addEventListener('click', function(){
        var at = dn.g_settings.get('softTabN') + 1;
        at = at > dn.const_.max_soft_tab_n ? dn.const_.max_soft_tab_n : at;
        dn.g_settings.set('softTabN',at);
    });
    el.font_size_dec.addEventListener('click', font_size_dec_click);
    el.font_size_inc.addEventListener('click', font_size_inc_click);    
    el.word_wrap_off.addEventListener('click', function(){
        dn.g_settings.set('wordWrap',[0,0,0])
    });
    el.word_wrap_at.addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt');
        dn.g_settings.set('wordWrap',[1,at,at]);
    });
    el.word_wrap_at_dec.addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt') - dn.const_.wrap_at_increment;
        at = at < dn.const_.min_wrap_at ? dn.const_.min_wrap_at : at;
        dn.g_settings.set('wordWrapAt',at);
    });
    el.word_wrap_at_inc.addEventListener('click', function(){
        var at = dn.g_settings.get('wordWrapAt') + dn.const_.wrap_at_increment;
        at = at > dn.const_.max_wrap_at ? dn.const_.max_wrap_at : at;
        dn.g_settings.set('wordWrapAt',at);
    });
    el.word_wrap_edge.addEventListener('click', function(){
        dn.g_settings.set('wordWrap',[1,null,null])
    });
    el.gutter_history_show.addEventListener('click', function(){
        dn.g_settings.set('showGutterHistory',1);
    });
    el.gutter_history_hide.addEventListener('click', function(){
        dn.g_settings.set('showGutterHistory',0);
    });

    // non-view interactivity...
    el.button_clear_clipboard.addEventListener('click', function(){
        dn.g_clipboard.clear();
    });
    el.button_clear_find_replace.addEventListener('click', function(){
        dn.g_find_history.clear();
    });

}

// additional controler functions ::::::::::::::::::::::::::::::::::

var font_size_dec_click = function(){
    var font_size = dn.g_settings.get('fontSize');
    font_size -= dn.const_.font_size_increment;
    font_size = font_size  < dn.const_.min_font_size ? dn.const_.min_font_size: font_size;
    dn.g_settings.set('fontSize', font_size);
}

var font_size_inc_click = function(){
    var font_size = dn.g_settings.get('fontSize');
    font_size += dn.const_.font_size_increment;
    font_size = font_size  > dn.const_.max_font_size ? dn.const_.max_font_size:font_size;
    dn.g_settings.set('fontSize', font_size);
}


// view function ::::::::::::::::::::::::::::::::::

var on_change = function(e){
    var new_value = e.newValue;

    switch(e.property){

        case "showGutterHistory":
        var s = dn.editor.getSession(); 
        if(new_value){
            el.gutter_history_show.classList.add('selected')
            el.gutter_history_hide.classList.remove('selected');
        }else{
            el.gutter_history_hide.classList.add('selected')
            el.gutter_history_show.classList.remove('selected');
        }
        break;

        case "wordWrapAt":
        el.word_wrap_at_text.textContent = new_value;
        break;

        case "wordWrap":
        if(!new_value[0])
            el.word_wrap_off.classList.add('selected');
        else
            el.word_wrap_off.classList.remove('selected');
        if(new_value[0] && !new_value[1])
            el.word_wrap_edge.classList.add('selected');
        else
            el.word_wrap_edge.classList.remove('selected');
        if(new_value[0] && new_value[1])
            el.word_wrap_at.classList.add('selected');
        else
            el.word_wrap_at.classList.remove('selected');
        break;

        case "softTabN":
        el.tab_soft_text.textContent = new_value;
        break;

        case "tabIsHard":        
        if(new_value){
            el.tab_soft.classList.remove('selected');
            el.tab_hard.classList.add('selected');
        }else{
            el.tab_soft.classList.add('selected');
            el.tab_hard.classList.remove('selected');
        }
        break;
        
        case "newLineDefault":
        if(new_value == "windows"){
            el.newline_unix.classList.remove('selected');
            el.newline_windows.classList.add('selected');
        }else{
            el.newline_unix.classList.add('selected');
            el.newline_windows.classList.remove('selected');
        }
        break;
        
        case "fontSize":
        var scrollLine = dn.get_scroll_line();
        el.font_size_text.textContent = new_value.toFixed(1);
        break;

        case "theme":
        theme_drop_down.SetInd(theme_drop_down.IndexOf(new_value), true);
        break;
  
    }
}

return {
    on_document_ready: on_document_ready
};



})();
