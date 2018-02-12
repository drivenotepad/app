"use strict";

var DropDown = function(val_array){
    //constructor, must use <new>
    
    var str = val_array.map(function(val){
                    return "<div class='dropdown_item' title='" + escape_str(val) + "'>" + escape_str(val) + "</div>";
                 }).join("");
    
    this.val_array = val_array.slice(0); 
    this.el_list = document.createElement('div');
    this.el_list.className ='dropdown_item_list';
    this.el_list.tabindex =-1
    this.el_list.style.display = 'none';
    this.el_list.innerHTML = str;

    this.el_collapsed = document.createElement('div');
    this.el_collapsed.className = 'dropdown_collapsed';
    
    this.el = document.createElement('div');
    this.el.className = 'dropdown';
    this.el.appendChild(this.el_list)
    this.el.appendChild(this.el_collapsed);
    this.ind = 0;
    this.el_collapsed.textContent = val_array[0];
    this.event_callbacks = {}; //map of callback lists
    this.open = false;
    this.enabled = true;
    
    var dd = this;

    this.document_mousedown = function(e){
        dd.el_list.style.display = 'none';
        dd.open = false;
        dd.trigger("blur");
        document.removeEventListener('mousedown', dd.document_mousedown);
    }

    this.el_collapsed.addEventListener('mousedown',function(){
        if(!dd.enabled)
            return;
        if(!dd.trigger("click"))
            return;
        dd.el.parentNode.classList.add("selected");
        dd.el_list.style.display = '';
        this.open = true;
        setTimeout(function(){
            dd.el_list.focus();
            dd.el_list.scrollTop = dd.el_list.children[dd.ind].offsetTop;
            document.addEventListener('mousedown', dd.document_mousedown)
        },1);
    });
    var on_click = function(e){
            dd.SetInd(this.getAttribute('data-ind'));
            dd.el_list.style.display = 'none';
            dd.open = false;
            e.stopPropagation();
            document.removeEventListener('mousedown', dd.document_mousedown);
    };
    for(var ii=0; ii<this.el_list.children.length; ii++){
        this.el_list.children[ii].setAttribute('data-ind', ii);
        this.el_list.children[ii].addEventListener("click", on_click); 
    }

    return this;
}

DropDown.FakeEvent = function(){//static subclass
    this.is_stopped = false;
}
DropDown.FakeEvent.prototype.preventDefault = function(){
    this.is_stopped = true;
}

DropDown.FakeEvent.prototype.stopImmediatePropagation = function(){
    this.is_stopped = true;
}

DropDown.prototype.addEventListener = function(evt, func){
    if(!(evt in this.event_callbacks))
        this.event_callbacks[evt] = [];
    this.event_callbacks[evt].push(func);
}

DropDown.prototype.trigger = function(evt, args){
    var fe = new DropDown.FakeEvent();
    if(evt in this.event_callbacks){
        for(var ii = 0; ii<this.event_callbacks[evt].length; ii++)
            this.event_callbacks[evt][ii].call(this, fe);
        if(fe.is_stopped)
            return false;
    }
    return true;
}
DropDown.prototype.IndexOf = function(val){
    return this.val_array.indexOf(val);
}

DropDown.prototype.GetVal = function(){
    return this.val_array[this.ind];
}

DropDown.prototype.SetInd = function(ind,no_trigger){
    ind = Math.min(Math.max(parseInt(ind), 0), this.val_array.length-1);
    if(ind === this.ind)
        return;
    this.el_list.children[this.ind].classList.remove("selected");
    this.el_collapsed.textContent = this.val_array[ind];
    this.el_collapsed.title = escape_str(this.val_array[ind]);
    this.ind = ind;
    this.el_list.children[ind].classList.add("selected");
    if(!no_trigger)
        this.trigger("change",{ind:ind,str:this.val_array[ind],isOpen: this.open});
}

DropDown.prototype.SetSelected = function(v){
    if(v)
        this.el.parentNode.classList.add("selected");
    else
        this.el.parentNode.classList.remove("selected");
}
