/**
 * Created by igormas on 8/18/15.
 */

'use strict';

(function(){
    var _updatedEventCb,_registeredNotUpdatedProducts;

    window.store = {};

    window.store._init = function(){
        _updatedEventCb = undefined;
        _registeredNotUpdatedProducts = []
    };
    window.store._init();

    window.store.when = function(){
        function updated(updatedEventCb){
            _updatedEventCb = updatedEventCb;
        }

        return {
            updated: updated
        }
    };

    window.store.error = function(){

    };

    window.store.ready = function(cb){
        cb();
    };

    window.store.refresh = function(){
        while(_registeredNotUpdatedProducts.length){
            _updatedEventCb(_registeredNotUpdatedProducts.shift());
        }
    };

    window.store.get = function(){

    };

    window.store.register = function(productData){
        var updatedProduct = {
            id: productData.id,
            alias: productData.alias
        };

        if(_updatedEventCb){
            _updatedEventCb(updatedProduct);
        }else{
            _registeredNotUpdatedProducts.push(updatedProduct);
        }
    };
})();
