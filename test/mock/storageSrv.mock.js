(function (angular) {
    'use strict';

    angular.module('storageSrv.mock', []).factory('StorageSrv',[
        '$q', 'ENV', '$parse',
        function ($q,ENV,$parse) {
            var StorageSrv = {
                __mockData: {
                    iap:{
                        products:{}
                    }
                }
            };
            StorageSrv.__mockData.iap.products[ENV.firebaseAppScopeName] = [
                {'appStoreId':'app.store.real.product1.sub1month','appStoreType':'paid subscription','length':1, 'playStoreUid':'play.store.real.product1.sub1month', 'playStoreType':'consumable'},
                {'appStoreId':'app.store.real.product2.sub3months','appStoreType':'paid subscription','length':3, 'playStoreUid':'play.store.real.product2.sub3mont', 'playStoreType':'consumable'}
            ];

            StorageSrv.get = function(path){
                if(!StorageSrv.__mockData[path]){
                    StorageSrv.__mockData[path] = {};
                }
                return $q.when(StorageSrv.__mockData[path]);
            };

            StorageSrv.set = function(path, value){
                return $q.when(StorageSrv.__mockData[path] = value);
            };

            return StorageSrv;
        }
    ]);

})(angular);


