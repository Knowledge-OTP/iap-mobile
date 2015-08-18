describe('testing service "IapSrv":', function () {
    'use strict';

    beforeEach(module('env.mock', 'angulartics', 'storageSrv.mock', 'test'));

    var $rootScope,IapSrv,availProductsFallback,StorageSrv,ENV;
    beforeEach(inject([
        '$injector',
        function ($injector) {
            $rootScope = $injector.get('$rootScope');
            IapSrv = $injector.get('IapSrv');
            availProductsFallback = $injector.get('availProductsFallback');
            StorageSrv = $injector.get('StorageSrv');
            ENV = $injector.get('ENV');
        }]));

    function getAsync(prom){
        var _res;
        prom.then(function(res){
            _res = res;
        });
        $rootScope.$digest();
        return _res;
    }

    function getActions(){
        var actions = {};

        actions.getProducts = function(){
            return getAsync(IapSrv.getProducts());
        };

        actions.simulateAndroid = function(returnOriginal){
            if(returnOriginal){
                ionic.Platform.isAndroid = actions.simulateAndroid.originalFn;
            }else{
                actions.simulateIOS(true);
                ionic.Platform.isAndroid = function(){
                    return true;
                };
            }
        };
        actions.simulateAndroid.originalFn = ionic.Platform.isAndroid;

        actions.simulateIOS = function(returnOriginal){
            if(returnOriginal){
                ionic.Platform.isIOS = actions.simulateIOS.originalFn;
            }else{
                actions.simulateAndroid(true);
                ionic.Platform.isIOS = function(){
                    return true;
                }
            }
        };
        actions.simulateIOS.originalFn = ionic.Platform.isIOS;

        return actions;
    }
    var actions = getActions();

    it('given iapSrv is initialized and no products available and platform is android when requesting for available products then fallback available products should be return', function () {
        StorageSrv.__mockData = {};
        window.store._init();
        actions.simulateAndroid();
        IapSrv.init();
        $rootScope.$digest();
        var products = actions.getProducts();
        var expectedProducts = availProductsFallback.map(function(product){
            return {
                id: product.playStoreUid,
                alias: product.playStoreUid.substr(product.playStoreUid.lastIndexOf('.') + 1)
            };
        });
        expect(products).toEqual(expectedProducts);
    });

    it('given iapSrv is initialized and no products available and platform is ios when requesting for available products then fallback available products should be return', function () {
        StorageSrv.__mockData = {};
        window.store._init();
        actions.simulateIOS();
        IapSrv.init();
        $rootScope.$digest();
        var products = actions.getProducts();
        var expectedProducts = availProductsFallback.map(function(product){
            return {
                id: product.appStoreId,
                alias: product.appStoreId.substr(product.appStoreId.lastIndexOf('.') + 1)
            };
        });
        expect(products).toEqual(expectedProducts);
    });

    it('given iapSrv is initialized and platform is android when requesting for available products then fallback available products should be return', function () {
        window.store._init();
        actions.simulateAndroid();
        IapSrv.init();
        $rootScope.$digest();
        var products = actions.getProducts();
        var expectedProducts = StorageSrv.__mockData.iap.products[ENV.firebaseAppScopeName].map(function(product){
            return {
                id: product.playStoreUid,
                alias: product.playStoreUid.substr(product.playStoreUid.lastIndexOf('.') + 1)
            };
        });
        expect(products).toEqual(expectedProducts);
    });

    it('given iapSrv is initialized and platform is ios when requesting for available products then fallback available products should be return', function () {
        window.store._init();
        actions.simulateIOS();
        IapSrv.init();
        $rootScope.$digest();
        var products = actions.getProducts();
        var expectedProducts = StorageSrv.__mockData.iap.products[ENV.firebaseAppScopeName].map(function(product){
            return {
                id: product.appStoreId,
                alias: product.appStoreId.substr(product.appStoreId.lastIndexOf('.') + 1)
            };
        });
        expect(products).toEqual(expectedProducts);
    });
});
