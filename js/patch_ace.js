"use strict";

/* 
   monkey patch UndoManager's execute function, so as to store unique ids with each "delta".

  Actually, it seems that a "delta" is the smallest unit of change in ace, above that is an 
  "array of deltas", and above that is a "deltaSet".   A deltaSet is the unit which is atomically
  undone/redone, so we might want to attach an id to that, but it is constructed in stages,
  with new "arrays of deltas" being "merged in".  So instead we actually register the ids on
  each "array of deltas".  The user dosen't need to care about this, they can just use
  .getCurrentId to read the unique value for the current state. 

  Prior to Feb 2014, it seems there was some code to $serializeDeltas in some manner,
  but that is no longer being used.  If it were to come back in to use we would have to
  change our monkey patching.

 */

(function(){

var UndoManager = ace.require("./undomanager").UndoManager;

var original_execute = UndoManager.prototype.execute;

UndoManager.prototype.id_counter = 0;

UndoManager.prototype.execute = function(options) {

    var deltaSets = options.args[0];
    for(var ii=0; ii<deltaSets.length; ii++)
        deltaSets[ii].delta_array_id = ++this.id_counter;
    original_execute.call(this, options);
}

UndoManager.prototype.getCurrentId = function(){
    var top_delta_set = this.$undoStack[this.$undoStack.length-1];
    if(!top_delta_set)
        return 0;
    return top_delta_set[top_delta_set.length-1].delta_array_id;
}

})();
