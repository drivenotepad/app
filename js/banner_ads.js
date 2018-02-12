"use strict"

/*
  Making a website takes time, why not get paid for it, right?

  This script is designed to be loaded a few minutes after page load,
  in turn it loads ad_data.jsonp, which calls back to dn.ads.on_load_data
  with an array of ads to choose from.

  The first ad is shown more or less immediatley after this script loads,
  so it's up to the caller to decide when that will be.
*/


dn.ads = (function(){

var display_time = 75 *1000;//ms
var no_display_time = 15 * 60 * 1000; //ms
var timer = 0;

var data = [];
var el = {};

el.ace_gutter = document.getElementsByClassName('ace_gutter')[0]
el.ad = document.createElement('div');
el.ad.id='banner_ad'
el.ad.style.position = 'fixed';
el.ad.style.right = '0px';
el.ad.style.top = '0px';
el.ad.style.bottom = '0px';
var on_load_data = function(loaded_data){
	data = loaded_data;
	display_random();
}

var display_random = function(){
	clearTimeout(timer);
	var d = data[(data.length * Math.random()) | 0];
	var img = new Image();
	img.onload = function() { 
		// we wait till img is in available before building the ad
		var editor_style = getComputedStyle(el.ace_gutter);
		el.ad.innerHTML = "<div style='position: absolute;top:50%; margin-top:" +(-d.height/2) +"px;'>" +
								"<div style='position:absolute; text-align:center; font-size:0.8em;text-decoration: underline;" +
										    "background:" +  editor_style.backgroundColor + "; color:" +  editor_style.color + 
										    ";transform: translateY(-100%);width: 100%;'>" +
								  		"<a href='https://drivenotepad.github.io#ads' target='_blank'>why have ads?</a>" +
								  		"<div class='close_ad' title='close' style='cursor:pointer;margin-top:5px;'>close this ad</div>" +
							  	"</div>" +
						  		"<a class='ad_img_wrapper' href='" + d.href + "' target='_blank'></a>" +
						  "</div>"	
		img.width = d.width;
		img.height = d.height;
		img.alt = d.alt;
		img.border = '0';
		el.ad.getElementsByClassName('ad_img_wrapper')[0].appendChild(img);
		el.ad.style.width = d.width + 'px';
		el.ad.style.zIndex = 200;
		el.ad.getElementsByClassName('close_ad')[0].addEventListener('click', hide_ad);
		el.ad.style.opacity = '0';
		el.ad.style.transitionProperty = 'opacity';
		el.ad.style.transitionDuration = '1s';
		el.ad.style.pointerEvents = 'none'; //during gradual entrance
		document.getElementsByTagName('body')[0].appendChild(el.ad);
		getComputedStyle(el.ad).backgroundColor; 	// force inital opacity
		el.ad.style.opacity = '1';
		ga('send', 'event', 'ad', 'show', 'id', d.ga_id);
		setTimeout(function(){
			el.ad.style.pointerEvents = '';
		}, 1200);
		timer = setTimeout(hide_ad, display_time);
	}
	img.src = d.img;
}

var hide_ad = function(){
	clearTimeout(timer);
	el.ad.parentNode.removeChild(el.ad);
	el.ad.innerHTML = "";
	timer = setTimeout(display_random, no_display_time);
}

// load the data (and run on_load_data callback
load_script_async('js/ad_data.jsonp');

return {
	on_load_data: on_load_data,
	debug: function(){
		display_time = 2000;
		no_display_time = 2000;
	}
}

})();
