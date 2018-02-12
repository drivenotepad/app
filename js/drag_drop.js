"use strict;"

/*
  This file has not been tested in a while and is not currently included in the build.
  To get it functioning again, note that you need to register handlers in the main 
  document_ready function in app.js:

  document.addEventListener('dragover', dn.document_drag_over);
  document.addEventListener('drop', dn.document_drop_file);
    
*/

dn.document_drag_over = function (evt) {
    evt = evt.originalEvent;
    evt.stopPropagation();
    evt.preventDefault();
    if(!(dn.the_file.is_brand_new && !dn.status.unsaved_changes)){
        evt.dataTransfer.dropEffect = 'none';
        if(dn.can_show_drag_drop_error){
            dn.show_error("File drag-drop is only permitted when the Drive Notpad page is displaying a new and unmodified file.")
            dn.can_show_drag_drop_error = false; //wait at least dn.const_.error_delay_ms until displaying the error again
            setTimeout(function(){dn.can_show_drag_drop_error = true;},dn.const_.error_delay_ms);
        }
        return;
    }
    evt.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
}
    
dn.document_drop_file = function(evt){
     if(!(dn.the_file.is_brand_new && !dn.status.unsaved_changes))
        return;
        
   evt = evt.originalEvent;
   evt.stopPropagation();
   evt.preventDefault();
   
   var files = evt.dataTransfer.files;
   if(files.length > 1){
       dn.show_error("You cannot drag-drop multiple files onto the Drive Notepad page, only individual files.")
   }
   var file = files[0];
   dn.the_file.title = file.name;
   dn.create_file();
   dn.the_file.isReading_file_object = true;   
   dn.show_status();
   var r = new FileReader();
   r.onload = dn.dropped_file_read;
   r.readAsText(file);      
}

dn.dropped_file_read = function(e){
    dn.the_file.isReading_file_object = false;
    dn.editor.getSession().setValue(e.target.result);
    // Note we don't encolse the above in a dn.setting_session_value = true block so the change event will fire and set pristine to false and ShowStatus etc.
}