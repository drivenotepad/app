
/*
The following would probably have been better implemented as a fork of ace.  We basically add to and overwrite whatever methods
we need to in order to acomplish our goals.  It's not pretty, but hopefully it's not appaling, given what the result is.

The main method exposed to the "user" is show_rows, which accepts a 1d array of 0s,1s,2s, and 3s.  There is one entry for
each of the lines in the document.  0 means hide the row, 1 means show it in white, 2 means render it marked as "added", 
and 3 means render it marked as "removed".

The implementation tries to use as much of ace's machienry as possible, but does have to build some of its own.  

Lines are hidden using ace's folding system, with the fold-markers being hidden with css.

The gutter numbering is overridden with a custom gutterRenderer.

Lines are marked with ace's addMarker and addGutterDecoration, but transitions are implemented "manually"...every time
ace completes its rendering, we explicitly apply our own styling logic to the markers it has produced.  Specifically, 
we modify the markers that were already visible the last time there was a render, with the state of the markers tracked
with the array rendered_row_transitions (and the variable first_rendered_row).  i.e. markers off-screeen, or newly on screen
are not transitioned to their final state.

I would ideally like to animate the height transition from show_row[ii] = 0, to show_row[ii] > 0.  But that is going to require
a lot more messing around with ace.

Some of the css in app.css is critical to making this look right, but we also have some styles hardcoded here.  That's obviously 
not ideal.

insertFullLines has also been overriden to ensure the show_rows is updated when lines are inserted.
It is intended that the document is only modified using that method, i.e. it is readOnly and no other insertion/deletion methods are used.


TODO:
  transitions possibly dont work on the last line of the document.
*/

dn.patch_editor_history = function(editor){
    var Range = ace.require('./range').Range;
    var dom = ace.require("./lib/dom");

    var show_row = [];
    var row_line_number = [0];
    var markers = [];
    var first_rendered_row = -1;
    var rendered_row_transitions = []; // array of {from_time, to_time, from_color, to_color}, first element is first_rendered_row
    var colors_background = [0xffffff, 0xffffff, 0xbcebe8, 0xffcaca]; //0,1,2,3, TODO: expose this as a setting, or read from css
    var transition_duration = 1000; // ms
    editor.$blockScrolling = Infinity;
    editor.setHighlightActiveLine(false);
    editor.setHighlightGutterLine(false);

    // Note that unlike other patches below, this bit changes the actual Range prototype for everyone
    // we need to keep the doc range, so we can porvide data-row when rendering markers
    Range.prototype.toScreenRange = function(session) {
        var screenPosStart = session.documentToScreenPosition(this.start);
        var screenPosEnd = session.documentToScreenPosition(this.end);

        ret = new Range(
            screenPosStart.row, screenPosStart.column,
            screenPosEnd.row, screenPosEnd.column
        );
        ret.doc_range = this.clone();
        return ret;
    };
    

    editor.session.gutterRenderer =  {
        getWidth: function(session, lastLineNumber, config) {
            return ("" + row_line_number[row_line_number.length-1]).length * config.characterWidth;
        },
        getText: function(session, row) {
            if(row >= row_line_number.length)
                return "" + row;
            return row_line_number[row] === -1 ? "-" : row_line_number[row];
        }
    };

    editor.session.removeAllGutterDecorations = function(){
        for(var ii=0; ii<this.$decorations.length; ii++)
            this.$decorations[ii] = "";
        this._signal("changeBreakpoint", {});
    }

    // add data-row into marker renderer
    editor.renderer.$markerBack.drawFullLineMarker = function(stringBuilder, range, clazz, config, extraStyle) {
        var top = this.$getTop(range.start.row, config);
        var height = config.lineHeight;
        if (range.start.row != range.end.row)
            height += this.$getTop(range.end.row, config) - top;

        stringBuilder.push(
            "<div class='", clazz, "' data-row='", range.doc_range.start.row, "' style='",
            "height:", height, "px;",
            "top:", top, "px;",
            "left:0;right:0;", extraStyle || "", "'></div>"
        );
    };

    var insertFullLines_original = editor.session.doc.insertFullLines;
    editor.session.doc.insertFullLines = function(arg_0, arg_1){
        // Takes either two args: at, lines[]
        //  or 1 arg: [{at, lines}, {at, lines}, ...]
        // in the first case, if at=-1, we reset using the new data.
        if(arg_0 === -1){
            show_row = new Uint8Array(arg_1.length);
            for(var ii=0;ii<arg_1.length; ii++)
                show_row[ii] = 1;
            var len = this.getLength() - 1;
            this.remove(new Range(0, 0, len, this.getLine(len).length));
            this.insertMergedLines({row: 0, column: 0}, arg_1);
        }else{
            show_row = Array.prototype.slice.call(show_row, 0); // temporarily convert to standard array for splicing
            if(arg_0.length !== undefined){
                if(arg_1 !== undefined) throw "batched insert takes one array"
                for(var kk=0; kk<arg_0.length; kk++){
                    var splice_args = [arg_0[kk].at, 0];
                    for(var ii=0; ii<arg_0[kk].lines.length; ii++)
                        splice_args.push(0);
                    Array.prototype.splice.apply(show_row, splice_args);
                    insertFullLines_original.call(this, arg_0[kk].at, arg_0[kk].lines);
                }
            } else {
                var splice_args = [arg_0, 0];
                for(var ii=0; ii<arg_1.length; ii++)
                    splice_args.push(0);
                Array.prototype.splice.apply(show_row, splice_args);
                insertFullLines_original.call(this, arg_0, arg_1);
            }
            show_row = new Uint8Array(show_row);
        }
        editor.show_rows(show_row);
    }

    editor.renderer.addEventListener('afterRender', function(){
        // TODO: check if it's a kind of render we need to care about

        var first_row = editor.renderer.getFirstVisibleRow();
        var last_row = editor.renderer.getLastVisibleRow();
        var first_row_old = first_rendered_row;
        var last_row_old = first_row_old + rendered_row_transitions.length;

        var time_now = Date.now(); //ms
        //console.log("Render request: " + first_row + ":"  + last_row + ", changes:" + editor.renderer.$changes);
        //console.log(JSON.stringify(rendered_row_transitions));
        //console.log("------")

        if(first_row_old < first_row){
            // remove unneeded rows from the start
            for(var row=first_row_old; row<last_row_old && row<first_row; row++)
                rendered_row_transitions.shift();
            
        } else if(first_row_old > first_row ) {
            // add some finished-transitioning rows at the start
            for(var row=Math.min(last_row, first_row_old)-1; row>=first_row; row--){
                rendered_row_transitions.unshift({row: row,
                                                  from_time: undefined,
                                                  from_color: undefined,
                                                  to_time: time_now,
                                                  to_color: colors_background[show_row[row]]});
            }
        }

        // Get the randomly ordered marker elements into a simple map from row to element
        var all_marker_els = editor.renderer.$markerBack.element.children;
        var marker_els = [];
        for(var ii=0; ii<all_marker_els.length; ii++)
            if(all_marker_els[ii].dataset.row !== undefined)
                marker_els[all_marker_els[ii].dataset.row] = all_marker_els[ii];

        // Firstly we go through all the marker elements produced, set their initial colors,
        // and transition durtations. Then we force the colors to take effect with a single
        // getComputedStyle call. We can then set the target colors, which we collected into
        // a list colors_to_set (which is paired with els_to_set).
        var els_to_set = [];
        var colors_to_set = [];
        var colors_current = [];
        for(var row=Math.max(first_row, first_row_old); row<Math.min(last_row, last_row_old); row++){
            if(show_row[row] === 0) continue;
            var el = marker_els[row];
            var transition = rendered_row_transitions[row-first_row];
            var to_color_new = colors_background[show_row[row]];
            var current_color;
            if(transition.to_time > time_now){
                // transition unfinished
                var elapsed_frac = (time_now - transition.from_time)/ (transition.to_time - transition.from_time); // denom is just transition_duration, unless we make things more complicated 
                current_color = mix_color(transition.from_color, transition.to_color, elapsed_frac);
            }else{
                // last transition already finished
                current_color = transition.to_color;
            }
            if(transition.to_color !== to_color_new){
                // new transition
                transition.from_color = current_color;                    
                transition.from_time = time_now;
                transition.to_time = time_now + transition_duration;
                transition.to_color = to_color_new;
            }
            el.style.backgroundColor = color_to_string(current_color);
            if(transition.to_time > time_now){
                el.style.transitionProperty = ''; // force the color above to take effect before we call getComputedStyle, below (not sure this is neccessarry)
                el.style.transitionDuration = (transition.to_time - time_now) + "ms";
                els_to_set.push(el);
                colors_to_set.push(to_color_new);
                colors_current.push(current_color);
            }
        }
        if(els_to_set.length)
            window.getComputedStyle(els_to_set[0]).backgroundColor;

        while(els_to_set.length){
            var el = els_to_set.pop();
            el.style.transitionProperty = 'background-color';
            el.style.backgroundColor = color_to_string(colors_to_set.pop());
        }

        if(last_row_old > last_row){
            // remove unneeded rows from the end
            for(row=last_row_old-1; row>=last_row && row>=first_row_old; row--)
                rendered_row_transitions.pop();
            
        } else if(last_row_old < last_row) {
            // add some finished-transitioning rows at the end
            for(row=Math.max(last_row_old, first_row); row<last_row; row++)
                rendered_row_transitions.push({row: row,
                                               from_time: undefined,
                                               from_color: undefined,
                                               to_time: time_now,
                                               to_color: colors_background[show_row[row]]});  
        }

        first_rendered_row = first_row;
        //console.log("achieved:")
        //console.log(JSON.stringify(rendered_row_transitions));
    })

    var mix_color = function(a, b, frac){
        //mixes r,g,b separately, with frac saying how far we have gone from a to b, i.e. a=0, b=1.
        return ((((a&0xff0000)>>16)*(1-frac) +  ((b&0xff0000)>>16)*frac) << 16 ) |
               ((((a&0xff00)>>8)*(1-frac) +  ((b&0xff00)>>8)*frac) << 8) |
               (a&0xff)*(1-frac) +  ((b&0xff)*frac);
    }
    var color_to_string = function(color){
        return "rgb(" + ((color & 0xff0000) >> 16) + ", " + ((color & 0xff00) >> 8) + ", " + (color & 0xff) + ")";
    }

    editor.show_rows = function(show_row_){
        /* show_row is a 1d array the same length as the number of lines in the document,
           entries that are falsey are silently folded, the remaining rows have their 
           numbering altered.
           show_row[ii]>=1 are marked with the class "special_2", "special_3",  etc,
           and the gutter is marked with gutter_special_2, _3, etc..

           show_row[ii]=3, is shown, but doesn't have a line number

           TODO: check zero-hack for when nothing is showing and/or there are no rows,
           and possibly other variations on that.
        */
        show_row = new Uint8Array(show_row_); //clone from whatever kind of array show_row_ was

        var n = editor.session.doc.getLength();
        if(show_row.length !== n) 
            throw "bad mask length";

        editor.session.unfold();
        while(markers.length)
            editor.session.removeMarker(markers.pop());
        editor.session.removeAllGutterDecorations();

        var line_no = 0;
        var fold_start = -1;
        row_line_number = [];
        var first_used_row = -1;
        for(var ii=0; ii<n; ii++){
            if(show_row[ii]){
                row_line_number.push(show_row[ii] === 3 ? -1 : ++line_no);
                if(fold_start !== -1){
                    if(fold_start > 0){
                        editor.session.addFold("", new Range(fold_start-1, Infinity, ii-1, Infinity));
                    } else {
                        // TODO: folding the lines from the very top is a bit messier...
                        //  it may be this version 0,0 rather than Inf, Inf version can be used more generally,
                        //  but it requires changing various other things too.
                        editor.session.addFold("", new Range(0, 0, ii, 0));
                        row_line_number[0] = 1;
                        first_used_row = ii;
                    }
                }
                fold_start = -1;
            }else{
                row_line_number.push(line_no);
                if(fold_start === -1)
                    fold_start = ii;
            }
        }
        if(fold_start !== -1)
            editor.session.addFold("", new Range(fold_start-1, Infinity, ii-1, Infinity));

        var previous = -1;
        if(first_used_row !== -1){
            //dealing further with the top-row hack thing...it's confusing, but this does the job...
            if(show_row[first_used_row]>=1)
                editor.session.addGutterDecoration(0, "gutter_special_" + show_row[first_used_row]);
        }
        for(var ii=0; ii<n; ii++){
            if(show_row[ii]>=1){
                markers.push(editor.session.addMarker(new Range(ii, 0, ii, Infinity),
                         "special_" + show_row[ii] + (previous !== show_row[ii] ? "_first" : ""), "fullLine", false));
                editor.session.addGutterDecoration(ii, "gutter_special_" + show_row[ii]);
            }
            previous = show_row[ii] ? show_row[ii] : previous;
        }

        editor.renderer.updateFull();
    };


    // this isn't that important, but we override the original version here so as to let the cursor blink in readonly mode
    editor.$resetCursorStyle = function() {
        var style = this.$cursorStyle || "ace";
        var cursorLayer = this.renderer.$cursorLayer;
        if (!cursorLayer)
            return;
        cursorLayer.setSmoothBlinking(/smooth/.test(style));
        cursorLayer.isBlinking = /*!this.$readOnly && */ style != "wide";
        dom.setCssClass(cursorLayer.element, "ace_slim-cursors", /slim/.test(style));
    };
    // but we have to disable dragging, or the cursor will stop blinking for some reason on failed drags
    editor.$mouseHandler.setOptions({dragEnabled: false})

}
