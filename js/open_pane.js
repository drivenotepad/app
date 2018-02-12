"use strict;"

dn.open_pane = (function(){

var el = {};
var picker;

var on_document_ready = function(){
    el.opener_button_a = document.getElementById('opener_button_a');
    el.opener_button_a.addEventListener('click', open_button_click);
}


var open_button_click = function(){
    gapi.load('picker', function(){
        var view = new google.picker.View(google.picker.ViewId.DOCS);
        try{
            if(!picker){
                picker = new google.picker.PickerBuilder()
                .enableFeature(google.picker.Feature.NAV_HIDDEN)
                .setAppId(dn.client_id) /* the drive scope requires explicit permission to open each file, and by providing the client_id here you get it for the chosen file */
                .setOAuthToken(gapi.auth.getToken().access_token) /* this gives permission to open the picker..you can do it wtihout a user-specific access_token, but we have one so lets use it */
                .addView(view)
                .setCallback(picker_callback)
                .build();        
                if(!picker)
                    throw "could not build picker";
            }
            picker.setVisible(true);
        } catch (e){
            dn.show_error("" + e);
        }
    });

}

var picker_callback = function(data) {
    if (data.action == google.picker.Action.PICKED) {
        var file_id = data.docs[0].id;
        var url = "?state=" + JSON.stringify({
            action: "open",
            userId: dn.url_user_id,
            ids: [file_id]
        });
        window.location = url;
    }else if(data.action == "cancel"){
        dn.focus_editor();
    }
}


return {
	on_document_ready: on_document_ready
};

})();