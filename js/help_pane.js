"use strict";

dn.help_pane = (function(){

var el = {};

var show_inner = function(inner_pane){
	// this is a view function for dn.g_settings['help_inner']
    // expects string 'shorcuts' or 'tips',  any other values shows main

    el.inner_pane_shortcuts.style.display = 'none';
    el.inner_pane_tips.style.display = 'none';
    el.inner_pane_main.style.display = 'none';

    el.button_shortcuts.classList.remove('selected');
    el.button_tips.classList.remove('selected');
    
    if(inner_pane == 'tips'){
        el.inner_pane_tips.style.display = '';
        el.button_tips.classList.add('selected');
    } else if(inner_pane == 'shortcuts'){
        el.inner_pane_shortcuts.style.display = '';
        el.button_shortcuts.classList.add('selected');
    } else {
        el.inner_pane_main.style.display = '';
    }
}


var render_user_name = function(val){
	el.user_name.textContent = val;
}

var create_pane_shortcuts = function(){
//This is hardly the world's most efficient way of doing this....(but it probably doesn't matter)...

    var arry = dn.shortcuts_list;
    var dict = {};
    var platform = dn.platform;

    if(platform == "Windows" || platform == "Linux"){
       for(var i=0;i<arry.length;i++){
            var parts = arry[i].split("|");
            if(parts[1].length)
                dict[parts[0]] = parts[1];
        }
    }else if(platform == "Mac"){
        for(var i=0;i<arry.length;i++){
            var parts = arry[i].split("|");
            if(parts[1].length)
                dict[parts[0]] = parts.length > 2? parts[2] : parts[1];
        }
    }else{
        //TODO: show something here, maybe let user switch, maybe have touch info for ipad & android.
    }
    
    var html = [];
    for(var action in dict)
        html.push("<div class='shortcut_item'><div class='shortcut_action'>" + 
                   action + "</div><div class='shortcut_key'>" + dict[action].replace(",","<br>") +
                   "</div></div>");
    
    // TODO: put shortcuts into element titles, see menu_id_to_caption
    //for(var action in dn.tooltip_info)if(action in dict)
    //    dn.tooltip_info[action] += dict[action];
	
    el.inner_pane_shortcuts.innerHTML =  [
        "<div class='widget_box_title shortcuts_title'>Keyboard Shortcuts ",
             platform ? "(" + platform + ")" : "" ,
        "</div>",
        "<div class='shortcuts_header_action'>action</div><div class='shortcuts_header_key'>key</div>",
        "<div class='shortcuts_list'>",
        html.join(''),
        "</div>"].join('');

}

var on_document_ready = function(){
    el.user_name = document.getElementById('user_name');
    el.inner_pane_shortcuts = document.getElementById('pane_help_shortcuts');
    el.inner_pane_tips = document.getElementById('pane_help_tips');
    el.inner_pane_main = document.getElementById('pane_help_main');
    el.button_shortcuts = document.getElementById('button_view_shortcuts');
    el.button_tips = document.getElementById('button_view_tips');
    el.button_shortcuts.addEventListener('click', function(){
        if(dn.g_settings.get('help_inner') === 'shortcuts')
            dn.g_settings.set('help_inner', 'main');
        else
            dn.g_settings.set('help_inner', 'shortcuts');
    })
    el.button_tips.addEventListener('click', function(){
        if(dn.g_settings.get('help_inner') === 'tips')
            dn.g_settings.set('help_inner', 'main');
        else
            dn.g_settings.set('help_inner', 'tips');
    })
    create_pane_shortcuts();
    dn.g_settings.addEventListener("VALUE_CHANGED", function(e){
    	if(e.property === 'help_inner')
    		show_inner(e.newValue);
    });
 
}


return {
	on_document_ready: on_document_ready,
	on_user_name_change: render_user_name
}

})();