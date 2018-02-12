"use strict";

dn.menu_id_to_caption = {
'menu_print': 'print',
'menu_sharing': 'sharing',
'menu_save': 'save',
'menu_history': 'history',
'menu_file': 'current file',
'menu_new': 'new',
'menu_open': 'new/open',
'menu_find': 'find/replace',
'menu_goto': 'goto line',
'menu_general_settings': 'general settings',
'menu_shortcuts': 'shortcuts',
'menu_drive': 'drive',
'menu_help': 'about/help'};


dn.shortcuts_list = [
"cut|Ctrl-X|Cmd-X",    
"copy|Ctrl-C|Cmd-C",
"paste|Ctrl-V|Cmd-V",
"cycle clipboard|Cltr-[V then left or right arrow]|Cmd-[V then left or right arrow]",
"select all|Ctrl-A|Cmd-A",
"find|Ctrl(-Alt)-F",
"replace|Ctrl-R",
"go to line|Ctrl(-Alt)-L",
"undo|Ctrl-Z|Cmd-Z",
"redo|Ctrl-Shift-Z,Ctrl-Y|Cmd-Shift-Z,Cmd-Y",
"autocomplete|Ctrl-Space|Cmd-Space",
" | ",
"toggle widget|Esc",
"save|Ctrl-S|Cmd-S",
"print|Ctrl(-Alt)-P|Cmd-P",
"file history|Ctrl-H|Cmd-H",
"new|Ctrl(-Alt)-N",
"open|Ctrl(-Alt)-O",
"  | ",
"to upper case|Ctrl-U",
"to lower case|Ctr-Shift-U",
"modify selection|Shift-(Ctrl-)(Alt-) {Down, Up, Left, Right, End, Home, PageDown, PageUp, End}|Shift-(Cmd-)(Alt-) {Down, Up, Left, Right, End, Home, PageDown,End}",
"copy lines down|Ctrl-Alt-Down|Cmd-Option-Down",
"copy lines up|Ctrl-Alt-Up|Cmd-Option-Up",
"center selection||Ctrl-L",
"fold all|Alt-0|Option-0",
"unfold all|Alt-Shift-0|Option-Shift-0",
"go to end|Ctrl-End,Ctrl-Down|Cmd-End,Cmd-Down",
"go to line end|Alt-Right,End|Cmd-Right,End,Ctrl-E",
"go to line start|Alt-Left,Home|Cmd-Left,Home,Ctrl-A",
"go to page down|PageDown|Option-PageDown,Ctrl-V",
"go to page up|PageUp|Option-PageUp",
"go to start|Ctrl-Home,Ctrl-Up|Cmd-Home,Cmd-Up",
"go to word left|Ctrl-Left|Option-Left",
"go to word right|Ctrl-Right|Option-Right",
"indent|Tab",
"outdent|Shift-Tab",
"overwrite|Insert",
"remove line|Ctrl-D|Cmd-D",
"remove to line end||Ctrl-K",
"remove to linestart||Option-Backspace",
"remove word left||Alt-Backspace,Ctrl-Alt-Backspace",
"remove word right||Alt-Delete",
"split line||Ctrl-O",
"toggle comment|Ctrl-7|Cmd-7",
"transpose letters|Ctrl-T"
]

dn.ext_to_mime_type = {
html:"text/html",
htm:"text/html",
js:"text/javascript",
pl:"application/x-perl",
xml:"text/xml",
c:"text/x-csrc",
cpp:"text/x-c++src",
h:"text/x-chdr",
json:"application/json",
php:"application/x-php",
svg:"text/html",
css:"text/css",
java:"text/x-java",
py:"text/x-python",
scala:"scala",
textile:"textile",
tex:"application/x-tex",
bib:"application/x-tex",
rtf:"application/rtf",
rtx:"application/rtf",
sh:"application/x-sh",
sql:"text/x-sql",
as:"text/x-actionscript"
//everything else is hopefully ok to be text/plain.
}

dn.tooltip_info = { //keys correspond to icon data-info attr, which will be the same as keys in SHORTCUTS_LIST
    "save" : "Save file contents.  ",
    "print": "Open print view in a new tab.  ",
    "sharing": "View and modify file's sharing status.",
    "file history": "Explore the file history.  ",
    "drive": "Show this file in Google Drive.  ",
    "about": "Drive Notepad website.",
    "shortcuts": "Keyboard shortcuts.",
    "new": "Create new file in a new tab.  ",
    "open": "Launch open dialoag.  ",
    "settings_file": "Properties of the current file.",
    "settings_general": "Your general Drive Notepad preferences.",
    "title": "Click to edit the file's title.",
    "description": "Click to edit the file's description."
}

// TODO: use keymaster rather than relying on this
var WHICH = {
ENTER: 13,
ESC: 27,
UP: 38,
DOWN: 40
};

dn.default_settings = {
ext: 'txt',
wordWrap: [true,null,null],
wordWrapAt: 80,
fontSize: 1,
widget_anchor: ['l',50,'t',10],
showGutterHistory: 1,
lastDNVersionUsed: '',
newLineDefault: 'windows',
historyRemovedIsExpanded: true,
softTabN: 4,
tabIsHard: 0,
widgetSub: 'general',
theme: "chrome",
pane: '',
pane_open: true,
find_regex: false,
find_whole_words: false,
find_case_sensitive: false,
help_inner: 'main',
find_goto: false,
find_replace: false
}

dn.impersonal_settings_keys = [
"wordWrap",
"wordWrapAt",
"fontSize",
"widget_anchor",
"showGutterHistory",
"historyRemovedIsExpanded",
"tabIsHard",
"softTabN",
"newLineDefault",
"widgetSub",
"theme",
"pane",
"pane_open",
"find_regex",
"find_whole_words",
"find_case_sensitive",
"help_inner",
"find_goto",
"find_replace"
];

dn.const_ = {
auth_timeout: dn.const_.auth_timeout, // already provided in app.html
drag_delay_ms: 400,
drag_shift_px: 40,
min_font_size: 0.3,
max_font_size: 5, 
max_wrap_at: 200,
min_wrap_at: 20,
wrap_at_increment: 10,
max_soft_tab_n: 10,
min_soft_tab_n: 2,
detect_tabs_spaces_frac: 0.9,
detect_tabs_tabs_frac: 0.9,
detect_tabs_n_spaces_frac: 0.99,
detect_tabs_n_spaces_frac_for_default: 0.6, //check
font_size_increment: 0.15, //check
error_delay_ms: 5000,//5 seconds
find_history_add_delay: 3000, //ms
find_history_max_len: 100,
clipboard_info_delay: 500, //ms
clipboard_max_length: 20, //TODO: decide whether a large clipboard slows page loads and whether we can do anything about it.
find_max_results_half: 3, 
find_max_prefix_chars: 10,
find_max_suffix_chars: 60,
ad_initial_wait: 4 * 60 * 1000 //ms
};

dn.platform = (function(){
    if(navigator.platform.indexOf("Win") >-1)
        return "Windows";
    else if(navigator.platform.indexOf("Linux") >-1)
        return "Linux";
    else if(navigator.platform.indexOf("Mac")>-1)
        return "Mac";   
    return null;
})();