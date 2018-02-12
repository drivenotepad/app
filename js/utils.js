"use strict";

var oxford_comma = function(arr){
    switch (arr.length){
        case 1:
            return arr[0];
        case 2:
            return arr[0] + " and " + arr[1];
        case 3:
            return arr[0] + ", " + arr[1] + ", and " + arr[2];
    }
}

var rotate = function(el, deg){
    el.style.transform = "rotate(" + deg + 'deg)';
    el.style.webkitTansform = "rotate(" + deg + 'deg)';
    el.style.mozTransform = "rotate(" + deg + 'deg)';
}

var translate = function(el, x, y){
    var str = x==null ? "" : "translate(" + x + "px," + y + "px)";
    el.style.transform = str;
    el.style.webkitTransform = str;
    el.style.mozTransform = str;
}

var text_multi = function(el, text, truncate_long_words){
    if(truncate_long_words){
        text = text.replace(/(\S{25})\S*/g,'$1...'); 
    }
    el.textContent = text;  
    el.innerHTML = el.innerHTML.replace(/\n/g,'<br/>').replace(/\t/g,'&nbsp;&nbsp;&nbsp; ');
}

var escape_str = function(str){
    // http://stackoverflow.com/a/18750001/2399799
    str = str || "";
    return str.replace(/[\u00A0-\u9999<>\&]/g, function(i) {
        return '&#' + i.charCodeAt(0) + ';';
    });
}

var hex_print_string = function(str){
    // only for debugging
    var c = [];
    for(var ii=0; ii<str.length; ii++)
        c.push(str.charCodeAt(ii).toString(16))
    console.log(c.join(" "))
}

var js_str_from_utf16 = function(str){
    // There's the endianness of the encoding and the endianness of the current CPU.
    // we only need to know the "relative" endian-ness in order to make a suitable request to TextDecoder.
    // I hope!
    var bom = new Uint16Array((new Uint8Array([str.charCodeAt(0), str.charCodeAt(1)])).buffer);
    var endian = bom[0] === 0xfffe ? 'be' : 'le';

    var arr = new Uint8Array(str.length-2)
    for(var ii=2;ii<str.length;ii++)
        arr[ii-2] = str.charCodeAt(ii);
    
    return (new TextDecoder('utf-16' + endian )).decode( new Uint16Array(arr.buffer));
}

var decode_body = function(body){
    body = body || "";
    // TODO: it might be better to use TextDecoder for UTF8 as well as 16, but you need a pollyfil for non Chrome/FF
    try {
        if(body.substr(0,2) == String.fromCharCode.call(null, 0xff, 0xfe) ||
           body.substr(0,2) == String.fromCharCode.call(null, 0xfe, 0xff)  )
            return js_str_from_utf16(body); // reinterpret pairs of single byte chars as actually being utf16
        else
           return decodeURIComponent(escape(body)); // reinterpreting single byte chars as actually being utf8
    } catch (e) {
       return body;
    }
}

var css_animation = (function(){
    var timers = []; // we store timers and matching els so we can cancel if needed
    var els = [];

    return function(el, cls, callback, delay){
        el.classList.remove(cls);
        el.offsetTop; //forces class to be removed, so we can actually re-add it.
        var old_idx = els.indexOf(el);
        if(old_idx != -1){
            clearTimeout(timers[old_idx]);
            timers.splice(old_idx, 1);
            els.splice(old_idx, 1);
        }
        els.push(el);
        timers.push(setTimeout(callback, delay)); //this is better than trying to use the endtransition event
        el.classList.add(cls);
    }
})();

var stop_propagation = function(e){
    e.stopPropagation();
}

var prevent_default = function(e){
    e.preventDefault();  
}

var prevent_default_and_stop_propagation = function(e){
    e.stopPropagation();
    e.preventDefault();
}

var until_success = function(executor){
    /* This was confusing to write, so when I finished I turned it into an S.O. answer:
          http://stackoverflow.com/a/35782428/2399799  
       An explanation and proper example is given there.*/
    
    var before_retry = undefined;
    var outer_executor = function(succeed, reject){
        var rejection_handler = function(err){
            if(before_retry){
                try {
                    var pre_retry_result = before_retry(err);
                    if(pre_retry_result)
                        return succeed(pre_retry_result);
                } catch (pre_retry_error){
                    return reject(pre_retry_error);
                }
            }
            return new Promise(executor).then(succeed, rejection_handler);                
        }
        return new Promise(executor).then(succeed, rejection_handler);
    }

    var outer_promise = new Promise(outer_executor);
    outer_promise.before_retry = function(func){
        before_retry = func;
        return outer_promise;
    }
    return outer_promise;
}




var ext_from_filename = function(str){
    // http://stackoverflow.com/a/12900504/2399799
    str = str || ""
    return str.slice((Math.max(0, str.lastIndexOf(".")) || Infinity) + 1);
}

var load_script_async = function(url){
    // method used by ga, which seems to work nicely
    var new_el = document.createElement('script');
    new_el.async = 1;
    new_el.src = url;
    var something_el = document.getElementsByTagName('script')[0];
    something_el.parentNode.insertBefore(new_el, something_el);     
}