"use strict";

var order_of_r_ids = []; // list of id's, 0 is "current", 1 is most recent actual revision, 2 the next most recent etc.
var r_text_arrays = {}; // map by revision id, each entry is an array of strings, one per line
var dom_lines = []; // list of boxed integers (instances of LineTracker), one for each line in the full diff document
var doc_n_to_dom_lines = undefined; // 1d array mapping from the lines of document revision[diffed_n-1] into the dom_lines array
var r_new_dom_lines = []; // list ordered by order_of_r_ids, each entry gives the array of boxed integers that were created specially for the given revision
var r_del_dom_lines = []; // analgous to above, but gives array of boxed integers that were delted as of this revision
var diffed_n = 0; // incremented after each diff is proceesed
var requested_line_is_used = [0]; // the main thread requests line_is_used for one or more revisions, we attempt to provide the answers as soon as possiblee
var last_valid_sent_line_is_used = -1; // it's possible for requests to get crossed with the replies to requests, so we have to track what's actually been sent.
var LineTracker = function(){
    // boxed int class
    this.idx = null;
    return this;
}

self.onmessage = function(e){
    
    if(e.data.reset_with_current_body !== undefined){
        order_of_r_ids = ["current"];
        dom_lines = [];
        doc_n_to_dom_lines = undefined;
        r_new_dom_lines = [];
        r_del_dom_lines = [];
        requested_line_is_used = [];
        diffed_n = 0;
        last_valid_sent_line_is_used = -1;
        r_text_arrays["current"] = difflib.stringAsLines(e.data.reset_with_current_body);
        attempt_diffing(); 
    }

    if(e.data.use_order !== undefined){
        order_of_r_ids = ["current"].concat(e.data.use_order);
        attempt_diffing(); 
    }
            
    if(e.data.revision !== undefined){
        r_text_arrays[e.data.revision.id] = difflib.stringAsLines(e.data.revision.body);
        attempt_diffing();
    }

    if(e.data.uses_line !== undefined){
        // revision_uses_line is the idx of the revision, not the id
        // note this overwrites any previous request.
        requested_line_is_used = e.data.uses_line;
        requested_line_is_used.sort(function(a,b){return b-a}); // sort in descending order
        for(var ii=0; ii<requested_line_is_used.length; ii++)
            if(requested_line_is_used[ii] <= last_valid_sent_line_is_used){
                requested_line_is_used.splice(ii, Infinity); // we've already sent these, so this request is a bit out of date
            }
        if(requested_line_is_used.length>0)
            attempt_send_line_is_used();
    }

}
 

var attempt_send_line_is_used = function(){
    // if any of the requests can be dealt with now, then
    // send the data for everything now.  Anything left over
    // will have to wait.  Note that we will have to resend 
    // everything next time, because it will have been invalidated by
    // the fact we added new data.
    for(var ii=0; ii<requested_line_is_used.length; ii++){
        if(requested_line_is_used[ii] < diffed_n){
            send_line_is_used();
            requested_line_is_used.splice(ii, Infinity);
            break;
        }
    }
}

var send_line_is_used = function(target_revision_idx){

    // refresh dom line idx
    for(var ii=0; ii<dom_lines.length; ii++)
        dom_lines[ii].idx = ii;

    var line_is_used = new Uint8Array(dom_lines.length); // initialize to 0
    for(var ii=0; ii<diffed_n; ii++){
        var new_lines_ii = r_new_dom_lines[ii];
        for(var jj=0; jj<new_lines_ii.length; jj++)
            line_is_used[new_lines_ii[jj].idx] = 1;
        // transfer copy of line_is_used to main thread..even though it didn't necessarily want this specific revision
        var copy = clone_array(line_is_used);
        self.postMessage({line_is_used:{idx: ii,
                          id: order_of_r_ids[ii],
                          buffer: copy.buffer,
                          diffed_n: diffed_n}},
                          [copy.buffer]);
        last_valid_sent_line_is_used = ii;
        var del_lines_ii = r_del_dom_lines[ii];
        for(var jj=0; jj<del_lines_ii.length; jj++)
            line_is_used[del_lines_ii[jj].idx] = 0;
    }

}

var clone_array = function(a){
    var b =  new a.constructor(a.length);
    b.set(a);
    return b;
}

var assign_range = function(dest, stop){
    for(var ii=0; ii<stop; ii++)
        dest[ii] = ii;
}

var assign_copy_adding_offset = function(dest, src, d_ind, s_ind, off, len){
    while(len--)
        dest[d_ind++] = src[s_ind++] + off; 
}

var assign_range_special = function(dest, src, d_ind, s_ind, off, len){
    // TODO: give this function a better name!
    var val = (s_ind < src.length ? src[s_ind] : src[src.length-1]+1) + off;
    var ret = val;
    while(len--) 
        dest[d_ind++] = val++; 
    return ret;
}


var prepare_current_revision = function(){
    var n = r_text_arrays["current"].length;
    doc_n_to_dom_lines = new Uint32Array(n);
    assign_range(doc_n_to_dom_lines, n);
    
    for(var ii=0; ii<n; ii++)
        dom_lines.push(new LineTracker());
    r_new_dom_lines.push(dom_lines.slice(0));
    r_del_dom_lines.push([]);

    last_valid_sent_line_is_used = -1;
    self.postMessage({diffed_revision:
    {idx: 0,
     id: "current",
     lines:  r_text_arrays["current"]}}); 
}


var prepare_revision = function(older_idx){
    // older_idx is the index in order_of_r_ids of the content we are supposed to diff,
    // doing it relative to the chronologically more recent, newer_idx = older_idx-1.

    var newer_idx = older_idx -1;
    var older_text_array = r_text_arrays[order_of_r_ids[older_idx]];
    var sm = new difflib.SequenceMatcher(r_text_arrays[order_of_r_ids[newer_idx]],
                                         older_text_array);

    var opps = sm.get_opcodes();
    var new_stuff_for_dom = [];
    var off = 0;

    var l2d_n = doc_n_to_dom_lines;
    var l2d_o = new Uint32Array(older_text_array.length);
    
    r_new_dom_lines.push([]);
    r_del_dom_lines.push([]);

    var off = 0;
    for(var i=0; i<opps.length; i++){
        var op = opps[i];
        if(op[0] == 'e'){
            // For EQUAL-blocks we just need to set the values in the new r_dom_idx_arrays mapping
            assign_copy_adding_offset(l2d_o, l2d_n, op[3], op[1], off, op[4]-op[3]);
            continue;
        }
        if(op[0] == 'd' || op[0] == 'r'){
            // For any blocks that delete lines (i.e. DELETE and REPLACE) we record which dom_lines are now "end"ed
            for(var j=op[1];j<op[2];j++)
                r_del_dom_lines[newer_idx].push(dom_lines[l2d_n[j]+off]); //note we need "+off" because of changes that have occured in previous iterations of the  i-loop 
        }
        if(op[0] == 'i' || op[0] == 'r'){
            // For any blocks that insert lines (i.e. INSERT and REPLACE) we need both to record the new r_dom_idx_arrays mapping 
            //      *and* insert some new LineTracker instances into dom_lines[] and store the new LineTrackers as "start"s in the older revision
            var at = assign_range_special(l2d_o, l2d_n, op[3], op[1], off, op[4]-op[3]);
            var lines = older_text_array.slice(op[3], op[4]);
            
            var splice_args = [at,0];
            for(var j=op[3]; j<op[4]; j++)
                splice_args.push(new LineTracker());
            Array.prototype.splice.apply(dom_lines, splice_args);  //splice the new LineTrackers into the dom_lines and..
            r_new_dom_lines[older_idx] = r_new_dom_lines[older_idx].concat(splice_args.slice(2)); //...store them in older
            
            off += lines.length; //note that the offset only ever grows because we never delete stuff in the dom, only insert stuff
            new_stuff_for_dom.push({at: at,
                                    lines: lines});
        }
        
    }

    doc_n_to_dom_lines = l2d_o;

    last_valid_sent_line_is_used = -1;
    self.postMessage({diffed_revision:
    {idx: older_idx,
     id: order_of_r_ids[older_idx],
     sections: new_stuff_for_dom}}); 
}




var attempt_diffing = function(){
    while(r_text_arrays[order_of_r_ids[diffed_n]] !== undefined){
        var id = order_of_r_ids[diffed_n];
        if(id === "current")
            prepare_current_revision();
        else
            prepare_revision(diffed_n);
        diffed_n++;
        attempt_send_line_is_used();
    }
}



/***
This is part of jsdifflib v1.0. <http://snowtide.com/jsdifflib>

Copyright (c) 2007, Snowtide Informatics Systems, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

    * Redistributions of source code must retain the above copyright notice, this
		list of conditions and the following disclaimer.
	* Redistributions in binary form must reproduce the above copyright notice,
		this list of conditions and the following disclaimer in the documentation
		and/or other materials provided with the distribution.
	* Neither the name of the Snowtide Informatics Systems nor the names of its
		contributors may be used to endorse or promote products derived from this
		software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR
BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.
***/
/* Author: Chas Emerick <cemerick@snowtide.com> */
//JSlint made happy by DM.
//
//opcodes are 5-tuples of the form [tag,a_start,a_end,b_start,b_end].
//the tag has one of the following 4 values: r=replace, d=delete, i=insert, e=equal
//where the indicies define the relavant sections in seq_a and seq_b
//Only replace and equal actually require all 4 indicies, but they are present in all cases.
//a_start from opp_{n+1} = a_end from opp_{n}, and same for b_start and b_end
// see http://docs.python.org/2/library/difflib.html#difflib.SequenceMatcher
//
var __whitespace = {" ":true, "\t":true, "\n":true, "\f":true, "\r":true};

var difflib = {
	defaultJunkFunction: function (c) {
		return __whitespace.hasOwnProperty(c);
	},
	
	stripLinebreaks: function (str) { return str.replace(/^[\n\r]*|[\n\r]*$/g, ""); },
	
	stringAsLines: function (str) {
		var lfpos = str.indexOf("\n");
		var crpos = str.indexOf("\r");
		var linebreak = ((lfpos > -1 && crpos > -1) || crpos < 0) ? "\n" : "\r";
		
		var lines = str.split(linebreak);
		for (var i = 0; i < lines.length; i++) {
			lines[i] = difflib.stripLinebreaks(lines[i]);
		}
		
		return lines;
	},
	
	// iteration-based reduce implementation
	__reduce: function (func, list, initial) {
        var value, idx;
		if (initial !== null) {
			value = initial;
			idx = 0;
		} else if (list) {
			value = list[0];
			idx = 1;
		} else {
			return null;
		}
		
		for (; idx < list.length; idx++) {
			value = func(value, list[idx]);
		}
		
		return value;
	},
	
	// comparison function for sorting lists of numeric tuples
	__ntuplecomp: function (a, b) {
		var mlen = Math.max(a.length, b.length);
		for (var i = 0; i < mlen; i++) {
			if (a[i] < b[i]) return -1;
			if (a[i] > b[i]) return 1;
		}
		
		return a.length == b.length ? 0 : (a.length < b.length ? -1 : 1);
	},
	
	__calculate_ratio: function (matches, length) {
		return length ? 2.0 * matches / length : 1.0;
	},
	
	// returns a function that returns true if a key passed to the returned function
	// is in the dict (js object) provided to this function; replaces being able to
	// carry around dict.has_key in python...
	__isindict: function (dict) {
		return function (key) { return dict.hasOwnProperty(key); };
	},
	
	// replacement for python's dict.get function -- need easy default values
	__dictget: function (dict, key, defaultValue) {
		return dict.hasOwnProperty(key) ? dict[key] : defaultValue;
	},	
	
	SequenceMatcher: function (a, b, isjunk) {
		this.set_seqs = function (a, b) {
			this.set_seq1(a);
			this.set_seq2(b);
		};
		
		this.set_seq1 = function (a) {
			if (a == this.a) return;
			this.a = a;
			this.matching_blocks = this.opcodes = null;
		};
		
		this.set_seq2 = function (b) {
			if (b == this.b) return;
			this.b = b;
			this.matching_blocks = this.opcodes = this.fullbcount = null;
			this.__chain_b();
		};
		
		this.__chain_b = function () {
			var b = this.b;
			var n = b.length;
			var b2j = this.b2j = {};
			var populardict = {};
            var elt;
			for (var i = 0; i < b.length; i++) {
				elt = b[i];
				if (b2j.hasOwnProperty(elt)) {
					var indices = b2j[elt];
					if (n >= 200 && indices.length * 100 > n) {
						populardict[elt] = 1;
						delete b2j[elt];
					} else {
						indices.push(i);
					}
				} else {
					b2j[elt] = [i];
				}
			}
	
			for (elt in populardict) {
				if (populardict.hasOwnProperty(elt)) {
					delete b2j[elt];
				}
			}
			
			var isjunk = this.isjunk;
			var junkdict = {};
			if (isjunk) {
				for (elt in populardict) {
					if (populardict.hasOwnProperty(elt) && isjunk(elt)) {
						junkdict[elt] = 1;
						delete populardict[elt];
					}
				}
				for (elt in b2j) {
					if (b2j.hasOwnProperty(elt) && isjunk(elt)) {
						junkdict[elt] = 1;
						delete b2j[elt];
					}
				}
			}
	
			this.isbjunk = difflib.__isindict(junkdict);
			this.isbpopular = difflib.__isindict(populardict);
		};
		
		this.find_longest_match = function (alo, ahi, blo, bhi) {
			var a = this.a;
			var b = this.b;
			var b2j = this.b2j;
			var isbjunk = this.isbjunk;
			var besti = alo;
			var bestj = blo;
			var bestsize = 0;
			var j = null;
	
			var j2len = {};
			var nothing = [];
			for (var i = alo; i < ahi; i++) {
				var newj2len = {};
				var jdict = difflib.__dictget(b2j, a[i], nothing);
				for (var jkey in jdict) {
					if (jdict.hasOwnProperty(jkey)) {
						j = jdict[jkey];
						if (j < blo) continue;
						if (j >= bhi) break;
                        var k;
						newj2len[j] = k = difflib.__dictget(j2len, j - 1, 0) + 1;
						if (k > bestsize) {
							besti = i - k + 1;
							bestj = j - k + 1;
							bestsize = k;
						}
					}
				}
				j2len = newj2len;
			}
	
			while (besti > alo && bestj > blo && !isbjunk(b[bestj - 1]) && a[besti - 1] == b[bestj - 1]) {
				besti--;
				bestj--;
				bestsize++;
			}
				
			while (besti + bestsize < ahi && bestj + bestsize < bhi &&
					!isbjunk(b[bestj + bestsize]) &&
					a[besti + bestsize] == b[bestj + bestsize]) {
				bestsize++;
			}
	
			while (besti > alo && bestj > blo && isbjunk(b[bestj - 1]) && a[besti - 1] == b[bestj - 1]) {
				besti--;
				bestj--;
				bestsize++;
			}
			
			while (besti + bestsize < ahi && bestj + bestsize < bhi && isbjunk(b[bestj + bestsize]) &&
					a[besti + bestsize] == b[bestj + bestsize]) {
				bestsize++;
			}
	
			return [besti, bestj, bestsize];
		};
		
		this.get_matching_blocks = function () {
			if (this.matching_blocks !== null) return this.matching_blocks;
			var la = this.a.length;
			var lb = this.b.length;
	
			var queue = [[0, la, 0, lb]];
			var matching_blocks = [];
			var alo, ahi, blo, bhi, qi, i, j, k, x;
			while (queue.length) {
				qi = queue.pop();
				alo = qi[0];
				ahi = qi[1];
				blo = qi[2];
				bhi = qi[3];
				x = this.find_longest_match(alo, ahi, blo, bhi);
				i = x[0];
				j = x[1];
				k = x[2];
	
				if (k) {
					matching_blocks.push(x);
					if (alo < i && blo < j)
						queue.push([alo, i, blo, j]);
					if (i+k < ahi && j+k < bhi)
						queue.push([i + k, ahi, j + k, bhi]);
				}
			}
			
			matching_blocks.sort(difflib.__ntuplecomp);
	
			var i1 , j1, k1, block, i2, j2, k2;
            i1 = j1 = k1 = block = 0;
			var non_adjacent = [];
			for (var idx in matching_blocks) {
				if (matching_blocks.hasOwnProperty(idx)) {
					block = matching_blocks[idx];
					i2 = block[0];
					j2 = block[1];
					k2 = block[2];
					if (i1 + k1 == i2 && j1 + k1 == j2) {
						k1 += k2;
					} else {
						if (k1) non_adjacent.push([i1, j1, k1]);
						i1 = i2;
						j1 = j2;
						k1 = k2;
					}
				}
			}
			
			if (k1) non_adjacent.push([i1, j1, k1]);
	
			non_adjacent.push([la, lb, 0]);
			this.matching_blocks = non_adjacent;
			return this.matching_blocks;
		};
		
		this.get_opcodes = function () {
			if (this.opcodes !== null) return this.opcodes;
			var i = 0;
			var j = 0;
			var answer = [];
			this.opcodes = answer;
			var block, ai, bj, size, tag;
			var blocks = this.get_matching_blocks();
			for (var idx in blocks) {
				if (blocks.hasOwnProperty(idx)) {
					block = blocks[idx];
					ai = block[0];
					bj = block[1];
					size = block[2];
					tag = '';
					if (i < ai && j < bj) {
						tag = 'r'; 
					} else if (i < ai) {
						tag = 'd';
					} else if (j < bj) {
						tag = 'i'; 
					}
					if (tag) answer.push([tag, i, ai, j, bj]);
					i = ai + size;
					j = bj + size;
					
					if (size) answer.push(['e', ai, i, bj, j]);
				}
			}
			
			return answer;
		};
		
		// this is a generator function in the python lib, which of course is not supported in javascript
		// the reimplementation builds up the grouped opcodes into a list in their entirety and returns that.
		this.get_grouped_opcodes = function (n) {
			if (!n) n = 3;
			var codes = this.get_opcodes();
			if (!codes) codes = [['e', 0, 1, 0, 1]];
			var code, tag, i1, i2, j1, j2;
			if (codes[0][0] == 'e') {
				code = codes[0];
				tag = code[0];
				i1 = code[1];
				i2 = code[2];
				j1 = code[3];
				j2 = code[4];
				codes[0] = [tag, Math.max(i1, i2 - n), i2, Math.max(j1, j2 - n), j2];
			}
			if (codes[codes.length - 1][0] == 'e') {
				code = codes[codes.length - 1];
				tag = code[0];
				i1 = code[1];
				i2 = code[2];
				j1 = code[3];
				j2 = code[4];
				codes[codes.length - 1] = [tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)];
			}
	
			var nn = n + n;
			var group = [];
			var groups = [];
			for (var idx in codes) {
				if (codes.hasOwnProperty(idx)) {
					code = codes[idx];
					tag = code[0];
					i1 = code[1];
					i2 = code[2];
					j1 = code[3];
					j2 = code[4];
					if (tag == 'e' && i2 - i1 > nn) {
						group.push([tag, i1, Math.min(i2, i1 + n), j1, Math.min(j2, j1 + n)]);
						groups.push(group);
						group = [];
						i1 = Math.max(i1, i2-n);
						j1 = Math.max(j1, j2-n);
					}
					
					group.push([tag, i1, i2, j1, j2]);
				}
			}
			
			if (group && !(group.length == 1 && group[0][0] == 'e')) groups.push(group);
			
			return groups;
		};
		
		this.ratio = function () {
			var matches = difflib.__reduce(
							function (sum, triple) { return sum + triple[triple.length - 1]; },
							this.get_matching_blocks(), 0);
			return difflib.__calculate_ratio(matches, this.a.length + this.b.length);
		};
		
		this.quick_ratio = function () {
			var fullbcount, elt, i;
			if (this.fullbcount === null) {
				this.fullbcount = fullbcount = {};
				for (i = 0; i < this.b.length; i++) {
					elt = this.b[i];
					fullbcount[elt] = difflib.__dictget(fullbcount, elt, 0) + 1;
				}
			}
			fullbcount = this.fullbcount;
	
			var avail = {};
			var availhas = difflib.__isindict(avail);
			var matches = 0, numb = 0;
			for (i = 0; i < this.a.length; i++) {
				elt = this.a[i];
				if (availhas(elt)) {
					numb = avail[elt];
				} else {
					numb = difflib.__dictget(fullbcount, elt, 0);
				}
				avail[elt] = numb - 1;
				if (numb > 0) matches++;
			}
			
			return difflib.__calculate_ratio(matches, this.a.length + this.b.length);
		};
		
		this.real_quick_ratio = function () {
			var la = this.a.length;
			var lb = this.b.length;
			return difflib.__calculate_ratio(Math.min(la, lb), la + lb);
		};
		
		this.isjunk = isjunk ? isjunk : difflib.defaultJunkFunction;
		this.a = this.b = null;
		this.set_seqs(a, b);
	}
};
