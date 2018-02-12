var offline_simple = (function(){

/*
This is very losely based on https://github.com/HubSpot/offline/blob/master/js/offline.js.
But much simplified.  Here we don't do anything until some external function calls 
.commence_testing, at that point we begin issuing a series of requests for the favicon.
As soon as one succeeds we trigger an 'online' event, which intereeted parties can listen
for using the .addEventListener('online', foo) method.  The requests follow an exponential
backoff, capped at a 1 request per minute. 
*/

var callbacks = [];

var delay_chain = {0: 1, 1:500, 500: 1000, 1000: 2500, 2500: 5000, 5000: 10000, 10000: 60000, 60000: 60000}
var delay = 0;
var timer = 0;


var commence_testing = function(){
	if(timer) return;
	delay = 0;
	clearTimeout(timer);
	timer = setTimeout(run_test, delay)
}

var request_test = function(){
	delay = delay_chain[delay];
	clearTimeout(timer); // just in case
	console.log("Test of internet access will be made in " + delay + "ms.")
	timer = setTimeout(run_test, delay)	
}

var addEventListener = function(kind, foo){
	if(kind !== "online") throw "only 'online' events please."
	callbacks.push(foo);
}

var trigger = function(kind){
	if(kind !== "online") throw "only 'online' events please."
	console.log("internet is available");
	for(var ii=0; ii<callbacks.length; ii++)
		callbacks[ii]({is_online: true});
}

var run_test = function() {
	timer = 0;
	console.log("testing for internet access")
    var xhr = new XMLHttpRequest;
    xhr.open('HEAD', "/favicon.ico?_=" + ((new Date()).getTime()), true);
    if (xhr.timeout != null) 
    	xhr.timeout = 5000;

	var check_status = function(){
    	if (xhr.status && xhr.status < 12000) 
      		trigger('online');
      	else
      		request_test();
    }

    if (xhr.onprogress === null) {
	    xhr.onerror = request_test;
	    xhr.ontimeout = request_test;
	    xhr.onload = check_status;
	} else {
		xhr.onreadystatechange = function(){
			if (xhr.readyState === 4)
          		checkStatus();
        	else if (xhr.readyState === 0)
        		request_test();
		}
	}

    try {
      xhr.send();
    } catch (e) {
      request_test();
    }
}


return {
	addEventListener: addEventListener,
	commence_testing: commence_testing
}

})();
