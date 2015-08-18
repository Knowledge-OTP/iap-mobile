var triggerIonicEvent = {};
window.triggerIonicEvent = triggerIonicEvent;

triggerIonicEvent.tap = function(element){
    'use strict';

    var domElement = element instanceof Element ? element : element[0];
    window.ionic.EventController.trigger('tap',{target: domElement});
};



