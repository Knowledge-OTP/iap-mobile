(function (angular) {
    'use strict';
    var availProductsFallback = [
        {'appStoreId':'app.store.fallback1.sub1month','appStoreType':'paid subscription','length':1, 'playStoreUid':'play.store.fallback1.sub1month', 'playStoreType':'consumable'},
        {'appStoreId':'app.store.fallback2.sub3months','appStoreType':'paid subscription','length':3, 'playStoreUid':'play.store.fallback2.sub3mont', 'playStoreType':'consumable'}
    ];
    var arr=[];

    angular.module('test', ['znk.iap']).config(function(IapSrvProvider){
        IapSrvProvider.registerProducts(arr);	
        IapSrvProvider.setValidator(function setValidatorFunc(){console.log('setValidatorFunc');});
    }).constant('availProductsFallback',availProductsFallback );
})(angular);
