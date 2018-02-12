"use strict"

dn.FileModel = function(){
    this.is_loaded = false; // when this is set to true we compute tabs, newlines etc, and continue to do so whenver set() is called.
    this.file_id = null;
    this.folder_id = null;
    this.title = null;
    this.description = '';
    this.ext = '';
    this.loaded_body = '';
    this.loaded_mime_type = undefined;
    this.chosen_mime_type = 'text/plain';
    this.is_read_only = false;
    this.is_shared = false;
    this.properties_chosen = {}, // combines detection, settings, and file properties
    this.properties = {}, // values stored in the file's meta data, defines which button is currently selected
    this.properties_detected_info = {} // caption for detection 
    this.change_callbacks = [];
    return this;
}

// basic events system for a single event called "change"
dn.FileModel.prototype.addEventListener = function(kind, c){
    if(kind !== "change") throw "only change listeners please!";
    this.change_callbacks.push(c);
}
dn.FileModel.prototype.trigger = function(kind, ob){
    if(kind !== "change") throw "only change events please!";
    for(var ii=0; ii<this.change_callbacks.length; ii++)
        this.change_callbacks[ii](ob);
}

dn.FileModel.prototype.set = function(obj){
    if(obj.syntax && obj.syntax !== this.properties.syntax){
        this.properties.syntax = obj.syntax;
        if(this.is_loaded)
            this.compute_syntax(); // will trigger 
    }
    if(obj.newline && obj.newline !== this.properties.newline){
        this.properties.newline = obj.newline;
        if(this.is_loaded)
            this.compute_newline(); // will trigger 
    }
    if(obj.tabs && !(this.properties.tabs && obj.tabs.val === this.properties.tabs.val && obj.tabs.n === this.properties.tabs.n)){
        this.properties.tabs = obj.tabs;
        if(this.is_loaded)
            this.compute_tabs(); // will trigger 
    }
    if(obj.title && obj.title !== this.title){
        this.update_mime_type(this.title, obj.title); 
        this.title = obj.title;
        this.trigger("change",{property: 'title'})
        if(this.is_loaded)
            this.compute_syntax(); // will trigger 
    }
    if(obj.description && obj.description !== this.description){
        this.description = obj.description;
        this.trigger("change",{property: 'description'})
    }
    if(obj.is_read_only && obj.is_read_only !== this.is_read_only){
        this.is_read_only = obj.is_read_only;
        this.trigger("change",{property: 'is_read_only'});
    }
    if(obj.is_shared && obj.is_shared !== this.is_shared){
        this.is_shared = obj.is_shared;
        this.trigger("change",{property: 'is_shared'});
    }
    if(obj.loaded_mime_type){
        this.loaded_mime_type = obj.loaded_mime_type;
        this.chosen_mime_type = this.loaded_mime_type || "text/plain";
        // see setting of title 
    }
    if(obj.is_loaded && ~this.is_loaded){
        this.is_loaded = true;
        this.compute_newline(); // these trigger when they are done
        this.compute_tabs();
        this.compute_syntax();
        this.trigger('change', {property: 'is_loaded'});
    }
}


dn.FileModel.prototype.update_mime_type = function(old_title, new_title){
    old_ext = ext_from_filename(old_title);
    new_ext = ext_from_filename(new_title);
    if(new_ext !== old_ext){
        this.loaded_mime_type = undefined; // the loaded mime type is no longer relevant to us
        this.chosen_mime_type = dn.ext_to_mime_type[new_ext] || "text/plain";
    }
}

dn.FileModel.prototype.compute_newline = function(){
    // populates properties _chosen, _detected and _detect_info
    // uses this.loaded_body, file's current properties, and dn.g_settings

    var str = this.loaded_body;

    if(this.properties.newline === "windows")
        this.properties_chosen.newline = "windows";
    else if(this.properties.newline === "unix")
        this.properties_chosen.newline = "unix";
    else
        this.properties.newline = "detect"; // force it to be the only possible alternative, we set choice below...
    
    // get dection info string, and if detection mode is active then chose the value...
    var first_n = str.indexOf("\n");
    if(first_n === -1){
        var val = dn.g_settings.get("newLineDefault");
        this.properties_detected_info.newline = "no newlines detected, default is " + val + "-like";
        if(this.properties.newline === "detect")
            this.properties_chosen.newline = val;
    } else {
        var has_rn = str.indexOf("\r\n") != -1;
        var has_solo_n = str.match(/[^\r]\n/) ? true : false;
        if(has_rn && !has_solo_n){
            this.properties_detected_info.newline = "detected windows-like newlines";
            if(this.properties.newline === "detect")
                this.properties_chosen.newline = "windows";
        }else if(has_solo_n && !has_rn){
            this.properties_detected_info.newline = "detected unix-like newlines";
            if(this.properties.newline === "detect")
                this.properties_chosen.newline = "unix";
        } else {
            var val = dn.g_settings.get("newLineDefault");
            this.properties_detected_info.newline = "mixture of newlines detected, default is " + val + "-like";
            this.properties_chosen.newline = val;
        }
    }

    this.trigger("change", {property: 'newline'});
}

dn.FileModel.prototype.compute_syntax = function(){
    // populates properties _chosen, _detected and _detect_info
    // uses this.title, and current file's properties

    var title = this.title;

    // validate specified syntax
    this.properties_chosen.syntax = undefined;
    if(this.properties.syntax && this.properties.syntax !== "detect"){
        var all_modes = require("ace/ext/modelist").modes;
        for(var ii=0; ii<all_modes.length; ii++)
            if(all_modes[ii].caption == this.properties.syntax){
                this.properties_chosen.syntax = this.properties.syntax; //valid
                break;
            }
        if(this.properties_chosen.syntax === undefined) // not found
            this.properties.syntax = "detect"; 
    }else{
        this.properties.syntax = "detect"; //force it to be valid
    }

    var detected = require("ace/ext/modelist").getModeForPath(title).caption;
    this.properties_detected_info.syntax = "detected " + detected + " from file extension";
    if(this.properties_chosen.syntax === undefined)
        this.properties_chosen.syntax = detected;

    this.trigger("change", {property: 'syntax'});
}

dn.FileModel.prototype.re_whitepace = /^([^\S\n\r]+)/mg;

dn.FileModel.prototype.compute_tabs = function(){
    // populates properties _chosen, _detected and _detect_info
    // uses this.loaded_body, file's current properties, and dn.g_settings
    // tabs have two subproperties, .val and .n, .val can be "detect", "tabs" or "spaces"
    // and n is an integer in the valid range, although if .properties.tabs.val != "spaces",
    // then .properties.tabs.n, may be undefiend, in which case display _chosen.n

    var str = this.loaded_body;

    // firstly, parse the stored tabs property, getting a valid .val and valid .n value.
    var prop = this.properties.tabs;
    try{
        if(prop.val === undefined && prop.n === undefined)
            prop = JSON.parse(prop)
        prop = {val: prop.val, n: prop.n}; // drop any other nonsense
        prop.n = parseInt(prop.n);
        if(!(prop.val === "tab" || prop.val === "spaces")) throw 0
        if(!(prop.n >= dn.const_.min_soft_tab_n && prop.n <= dn.const_.max_soft_tab_n))
            prop.n = undefined; 
        if(prop.val === "spaces" && prop.n === undefined) throw 0
    }catch(e){
        prop = {val: "detect"};
    }
    this.properties.tabs = prop; // force it to be whatever we parsed

    if(prop.val === "tab")
        this.properties_chosen.tabs = prop; // may need to chose n still
    else if(prop.val === "spaces")
        this.properties_chosen.tabs = prop; // n is definitely valid
    else
        this.properties_chosen.tabs = undefined; // we need to chose val and n 
    

    // Now do detection....

    // find non-zero-length whitespace at start of all lines
    var indents = str.match(this.re_whitepace) || []; 

    //  build the stats for those lines...
    var n_only_tabs = 0;
    var n_only_space; // we compute this after the loop
    var space_hist = [];
    var n_with_mixture = 0;
    var n_samp = Math.min(indents.length, 1000);
    for(var ii=0; ii<n_samp; ii++){
        var indents_ii = indents[ii]
        var without_tabs = indents_ii.replace("\t", "");
        if(without_tabs.length === 0)
            n_only_tabs++;
        else if(without_tabs.length !== indents_ii.length)
            n_with_mixture++;
        else
            space_hist[indents_ii.length] = (space_hist[indents_ii.length] || 0) + 1;
    }
    n_only_space = n_samp - n_with_mixture - n_only_tabs;


    if(n_only_tabs/n_samp >= dn.const_.detect_tabs_tabs_frac){
        // detected tab...
        this.properties_detected_info.tabs = "hard tab indentation detected";
        if(this.properties_chosen.tabs === undefined)
            this.properties_chosen.tabs = {val: 'tabs'}
        if(this.properties_chosen.tabs.n === undefined)
            this.properties_chosen.tabs.n = dn.g_settings.get('softTabN'); // we have to show something for n

    } else if(n_samp === 0 || n_only_space/n_samp < dn.const_.detect_tabs_spaces_frac){
        // no detection possible, use default....

        if(this.properties_chosen.tabs === undefined){
            this.properties_chosen.tabs = {
                val: dn.g_settings.get('tabIsHard') ? 'tabs' : 'spaces',
                n: dn.g_settings.get('softTabN')};
        }
        this.properties_detected_info.tabs =
            (n_samp === 0 ?
                   "no indentations detected" 
                 : "detected mixture of tabs")
            + ", default is " + (this.properties_chosen.tabs.val == 'tabs' ?
                   "hard tabs"
                 :  dn.g_settings.get('softTabN') + " spaces");
        
    } else {
        // detected spaces, but exxactly how many? 

        //Build a second space hist, using all "harmonics"....
        var space_mod_hist = [];
        for(var ss=dn.const_.min_soft_tab_n; ss<=dn.const_.max_soft_tab_n; ss++){
            for(var ii=ss, m=0; ii<space_hist.length; ii+=ss)
                m += space_hist[ii] === undefined ? 0 : space_hist[ii];
            space_mod_hist[ss] = m;
        }
        
        // and find the largest indent that passes threshold...
        var ss;
        for(ss=dn.const_.max_soft_tab_n; ss>=dn.const_.min_soft_tab_n; ss--)
            if(space_mod_hist[ss]/n_only_space > dn.const_.detect_tabs_n_spaces_frac){
                this.properties_detected_info.tabs = "detected soft-tabs of " + ss + " spaces"
                break;
            }

        // if nothing was over threshold, use default space count
        if(ss < dn.const_.min_soft_tab_n){
            ss = dn.g_settings.get('softTabN');    
            if(space_mod_hist[ss]/n_only_space > dn.const_.detect_tabs_n_spaces_frac_for_default)
                this.properties_detected_info.tabs = "detected close match to default of " + ss + " spaces";
            else 
                this.properties_detected_info.tabs = "detected soft-tabs, assuming default " + ss + " spaces";
        }

        // if we need to specify a space count use the ss value we ended up with...
        if(this.properties_chosen.tabs === undefined)
            this.properties_chosen.tabs = {val: 'spaces'};
        if(this.properties_chosen.tabs.n === undefined)
            this.properties_chosen.tabs.n = ss;
    }
    
    this.trigger("change", {property: 'tabs'});
}

