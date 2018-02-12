"use strict";

dn.do_print = (function(){


 var line_to_html = function (n){
    var printLayer = Object.create(ace.require('ace/layer/text').Text.prototype); 
    var tokens  = dn.editor.getSession().getTokens(n);
    var html = [];
    var screenColumn = 0;
    for (var i = 0; i < tokens.length; i++) {
       var token = tokens[i];
       var value = token.value.replace(/\t/g,'   ');//TODO:deal with tabs properly
       if(value)
           printLayer.$renderToken(html, 0, token, value);
    }
    return html.join('').replace(/&#160;/g,' ');
}

return function(){
    var content = dn.editor.session.doc.getAllLines();
    var html = Array(content.length);

    for(var i=0; i<content.length;i++)
        html[i] = "<li><div class='printline'>" + line_to_html(i) + '</div></li>';

    var printWindow = window.open('','');
    printWindow.document.writeln(
            "<html><head><title>" + dn.the_file.title 
            + "</title></head><style>"
            + ace.require('ace/theme/' + dn.g_settings.get('theme')).cssText + "\nbody{font-size:"
            + dn.g_settings.get('fontSize') *14 +"px; white-space:pre-wrap;" + 
            "font-family:'Monaco','Menlo','Ubuntu Mono','Droid Sans Mono','Consolas',monospace;}"
            + "\nli{color:gray;}\n.printline{color:black;}</style>" + 
            "<body class='ace-"+ dn.g_settings.get('theme').replace('_','-') +"'><ol id='content'>" + 
            html.join("") +
            "</ol></body></html>");
    printWindow.print();
    return false;
}


})()
