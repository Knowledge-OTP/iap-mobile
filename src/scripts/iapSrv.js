(function (angular) {
    'use strict';

    angular.module('znk.iap').provider('IapSrv',[function () {
        
        var productsGetter;
        var validatorFuncRef;
        var _availProductsFallback;
        var enableNoStoreMode;
        this.setProductsFallback = function(availProductsFallback){
            _availProductsFallback = availProductsFallback;
        };

        this.registerProducts = function(fnOrArr){
            productsGetter = fnOrArr;
        };

        this.setValidator = function(func){
            validatorFuncRef = func;
        };
        
        this.setNoStoreMode = function(shouldEnableNoStoreMode){
            enableNoStoreMode = shouldEnableNoStoreMode;
        };

        this.$get = [
            '$window', '$q', '$injector', '$filter', 'InAppPurchaseHelperSrv', 'ENV', '$analytics','$ionicLoading','$ionicPopup','$document','$timeout',
            function ($window, $q, $injector, $filter, InAppPurchaseHelperSrv, ENV, $analytics, $ionicLoading, $ionicPopup, $document, $timeout) {

                var isOnline = !!($window.navigator && $window.navigator.onLine);
                var validatorFunc;
                var isWeb = !$window.cordova;
                
                // var PURCHASED_EVENT = 'iap:purchased';
                //var STORE_PRODUCT_UPDATED_EVENT = 'iap:productUpdated';
                //var LOGIN_EVENT = 'auth:login';

                var iapSrv = {
                    initializedStore: false,
                    //store products, updated only by store update event handelr
                    products: {},
                    //application products (not store products)
                    appProductsArr: [],
                    loadingError: false,
                    isShowingModal: false,
                    currentErrorPopup: undefined,
                    isPurchasing: false,
                    purchaseInProgressProm: undefined
                };

                function _getValidatorFunc(){
                    if (!validatorFunc){
                        validatorFunc = $injector.invoke(validatorFuncRef);
                    }
                    return validatorFunc;
                }

                function _getAppProducts(){
                    console.log('_getAppProducts');
                    return $injector.invoke(productsGetter);
                }

                iapSrv.isStoreLoaded = function isStoreLoaded(){
                    return iapSrv.products[iapSrv.appProductsArr[0].id] || iapSrv.isLoadingError();
                };

                iapSrv.isLoadingError = function isLoadingError(){
                    return iapSrv.loadingError;
                };

                iapSrv.getAppProduct = function(productId){
                    for (var i = 0; i < iapSrv.appProductsArr.length; i++) { 
                        if (iapSrv.appProductsArr[i].id === productId){
                            return iapSrv.appProductsArr[i];
                        }
                    }
                };

                iapSrv.getStoreProduct = function(productId){
                    return iapSrv.products[productId];
                };

                iapSrv.getStoreProducts = function(){
                    // if (!isOnline) {
                    //     return $q.reject('No Internet connection');                        
                    // }

                    var storeProductsArr = [];
                    for(var propertyName in iapSrv.products) {
                        storeProductsArr.push(angular.copy(iapSrv.products[propertyName]));
                    }
                    return storeProductsArr;
                };
                
                // iapSrv.getProducts = function () {
                //     if (!isOnline) {
                //         return $q.reject('No Internet connection');                        
                //     }

                //     //TODO - ASSAF - CHECK if store loaded, maybe refresh store
                //     if (!iapSrv.isStoreLoaded){
                //         return $q.reject('store not loaded');
                //     }

                //     var productsArr=[];
                //     iapSrv.appProductsArr.forEach(function (appProduct){
                //         productsArr.push(iapSrv.products[appProduct.id]);
                //     });

                //     return $q.when(productsArr);
                // };


                iapSrv.purchase = function(productId){

                    iapSrv.purchaseInProgressProm = $q.defer();

                    if (enableNoStoreMode || isWeb){
                        var validator = _getValidatorFunc();
                        var mockProductForWeb = {};
                        var appProduct = iapSrv.getAppProduct(productId);

                        angular.extend(mockProductForWeb, appProduct, { 
                            transaction: {'id':'demo'}
                        });

                        validator(mockProductForWeb).then(function(res){
                            if (res){
                                console.log('mock purchase completed');
                                // $rootScope.$broadcast(PURCHASED_EVENT, appProduct.id);
                                iapSrv.purchaseInProgressProm.resolve(appProduct);
                            }
                            else{
                                console.log('error in validating purchase');
                                iapSrv.purchaseInProgressProm.reject();
                            }
                        })
                        .catch(function(err){
                            console.log('error in purchase, err: ' + err);
                            iapSrv.purchaseInProgressProm.reject(err);
                        });
                        return iapSrv.purchaseInProgressProm.promise;
                    }


                    
                    iapSrv.isShowingModal=true;
                    var product = iapSrv.products[productId];

                    if (product){
                        iapSrv.isPurchasing = true;

                        $window.store.order(product.id).error(function(err){
                            console.log('error in purchase');
                            if (iapSrv.purchaseInProgressProm){
                                iapSrv.purchaseInProgressProm.reject(err);
                            }

                            $ionicLoading.hide();

                            if (iapSrv.currentErrorPopup){
                                iapSrv.currentErrorPopup.close();
                            }

                            // iapSrv.currentErrorPopup = $ionicPopup.alert({
                            //     title: 'Error',
                            //     template: 'There was an error with the purchase',
                            //     okText: 'OK',
                            //     okType: 'button-default'
                            // });

                            iapSrv.currentErrorPopup.then(function(){
                                iapSrv.currentErrorPopup = undefined;
                            });
                        });
                    }
                    else{

                        if (iapSrv.currentErrorPopup){
                            iapSrv.currentErrorPopup.close();
                        }

                        // iapSrv.currentErrorPopup = $ionicPopup.alert({
                        //     title: 'Error',
                        //     template: 'There was an error with the product',
                        //     okText: 'OK',
                        //     okType: 'button-default'
                        // });

                        iapSrv.currentErrorPopup.then(function(){
                            iapSrv.currentErrorPopup = undefined;
                            iapSrv.purchaseInProgressProm.reject();
                        }); 
                    }
                    return iapSrv.purchaseInProgressProm.promise;
                };

                //TODO - protect by promise, two simaltonasily will crash the app
                // iapSrv.refreshStore = function refreshStore(){

                //     if (InAppPurchaseHelperSrv.canUpgrade()){
                //         console.log('refresh store initiated');
                //         if (!iapSrv.initializedStore){
                //             iapSrv.initStore();
                //         }
                //         else{
                //             $window.store.refresh();
                //         }
                //     }
                //     else{
                //         console.log('user cannot upgrade at this time');
                //     }
                // };

                function initAppProductsForStore(){
                    console.log('init app products for the store');
                    return _getAppProducts();
                }

                /////////////////////////////
                /////////////////////////////
                // initStore
                /////////////////////////////
                /////////////////////////////
                iapSrv.initStore = function initStore(){

                    if (enableNoStoreMode || isWeb){
                        initAppProductsForStore().then(function(appProductsArr){
                            iapSrv.appProductsArr = appProductsArr;
                            console.log('app products loaded');
                        })
                        .catch(function(err) {
                            console.error('failed to load app products, err:' + err);
                        });
                        return;
                    }
                    
                    if (!$window.store){
                        console.log('store is not available');
                        iapSrv.loadingError = true;
                        return;
                    }
                    else{
                        console.log('initializing store');
                    }

                    // var childScope = $rootScope.$new(true);
                    // childScope.$on(PURCHASED_EVENT,function(productId){
                    //     console.log('purchased event, productId: ' + productId);
                    //     if (iapSrv.isShowingModal){
                    //         $ionicLoading.show({
                    //             template: 'Thank you for your purchase !!!'
                    //         });
                    //         $timeout(function(){
                    //             $ionicLoading.hide();
                    //         }, 4000);
                    //     }

                    // });

                    var initAppProductsForStoreProm = initAppProductsForStore();
                    initAppProductsForStoreProm.catch(function () {
                        iapSrv.loadingError = true;
                        return;
                    });
                    initAppProductsForStoreProm.then(function (appProductsArr) {
                        iapSrv.appProductsArr = appProductsArr;
                        console.log('app products loaded');

                        if (!iapSrv.initializedStore){
                            iapSrv.initializedStore = true;

                            $window.store.verbosity = false ? $window.store.DEBUG : $window.store.QUIET;

                            /////////////////////////////
                            /////////////////////////////
                            //store.validator
                            /////////////////////////////
                            /////////////////////////////
                            
                            $window.store.validator = function(product, callback){

                                console.log('validator');

                                if (InAppPurchaseHelperSrv.canUpgrade() && product.transaction){
                                    console.log('validator and transaction:' + JSON.stringify(product.transaction));

                                    $ionicLoading.hide();

                                    

                                    var validator = _getValidatorFunc();

                                    validator(product).then(function(res){
                                        if (res){
                                            iapSrv.purchaseInProgressProm.resolve(product);
                                            callback(true, product);
                                            if (iapSrv.isShowingModal){
                                                $ionicLoading.show({
                                                    template: 'purchase verified'
                                                });
                                                $timeout(function(){
                                                    $ionicLoading.hide();
                                                }, 2000);
                                            }
                                            // $rootScope.$broadcast(PURCHASED_EVENT, product.id);
                                        }
                                        else{
                                            console.error('error in store validator');
                                            iapSrv.purchaseInProgressProm.reject(false);
                                            callback(false, "Impossible to proceed with validation");
                                        }
                                    }).catch(function(err){
                                        console.error('error in store validator: ' + err);
                                        iapSrv.purchaseInProgressProm.reject(err);
                                        callback(false, "Impossible to proceed with validation");
                                    });
                                }
                            };

                            /////////////////////////////
                            /////////////////////////////
                            // Register App products
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){

                                //TODO - Assaf - check if product is already registered
                                // if (_store.get(product.alias)) {
                                //     return;
                                // }

                                console.log('registering product: ' + JSON.stringify(appProduct));
                                // console.log('id-' + appProduct.id);
                                // console.log('alias-' + appProduct.alias);
                                // console.log('type-' + appProduct.type);

                                $window.store.register({
                                    id: appProduct.id,
                                    alias: appProduct.alias,
                                    type: appProduct.type
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // purchaseApproved
                            /////////////////////////////
                            /////////////////////////////

                            var purchaseApproved = function purchaseApproved(product){
                                if (iapSrv.isShowingModal){

                                    $ionicLoading.show({
                                        template: 'Purchase approved, validating...'
                                    });
                                }
                                console.log('purchase approved');
                                $analytics.eventTrack('purchase-approved', {category: 'purchase', label: 'approved'});
                                product.verify();
                            };

                            /////////////////////////////
                            /////////////////////////////
                            // Approved App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).approved(function(product){
                                    purchaseApproved(product);
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Verified App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).verified(function(product){
                                    console.log('purchase verified');
                                    product.finish();
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Unverified App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).unverified(function(){
                                    console.log('purchase unverified');
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // purchaseInitiated
                            /////////////////////////////
                            /////////////////////////////

                            var purchaseInitiated = function purchaseInitiated(){
                                $ionicLoading.show({
                                    template: 'Initiating purchase...'
                                });
                                console.log('purchase initiated');
                            };
                            
                            /////////////////////////////
                            /////////////////////////////
                            // Initiated App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).initiated(function(){
                                    purchaseInitiated();                               
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // purchaseCancelled
                            /////////////////////////////
                            /////////////////////////////

                            var purchaseCancelled = function purchaseCancelled(){
                                $ionicLoading.hide();
                                console.log('purchase cancelled');
                                // $ionicPopup.alert({
                                //     title: 'Error',
                                //     template: 'Your purhcase has been cancelled',
                                //     okText: 'Got it',
                                //     okType: 'button-default'
                                // });
                                if (iapSrv.purchaseInProgressProm){
                                    iapSrv.purchaseInProgressProm.reject();
                                }
                            };
                            
                            /////////////////////////////
                            /////////////////////////////
                            // Cancelled App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){
                                $window.store.when(appProduct.id).cancelled(function(product){
                                    purchaseCancelled(product);                               
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Updated App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){
                                $window.store.when(appProduct.id).updated(function(product){
                                    console.log('product updated: ' + product.id);
                                    iapSrv.products[product.id] = product;
                                    //$rootScope.$broadcast(STORE_PRODUCT_UPDATED_EVENT);
                                                                   
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Store error
                            /////////////////////////////
                            /////////////////////////////

                            $window.store.error(function(err){
                                if (iapSrv.purchaseInProgressProm){
                                    iapSrv.purchaseInProgressProm.reject(err);
                                }
                                $ionicLoading.hide();
                                console.log('store error ' + err.code + ': ' + err.message);
                                console.log('isShowingModal: ' + iapSrv.isShowingModal);

                                if (err.code !== $window.store.ERR_PURCHASE && iapSrv.isShowingModal){
                                    iapSrv.loadingError = true;

                                    if (!iapSrv.currentErrorPopup){
                                        iapSrv.currentErrorPopup = $ionicPopup.alert({
                                            title: 'Error',
                                            template: 'There was an error with the store. Please try again later.',
                                            okText: 'OK',
                                            okType: 'button-default'
                                        });
                                        iapSrv.currentErrorPopup.then(function(){
                                            iapSrv.currentErrorPopup = undefined;
                                        });
                                    }
                                }

                                if (err.code && iapSrv.isShowingModal){
                                    iapSrv.loadingError = true;

                                    if (!iapSrv.currentErrorPopup){
                                        iapSrv.currentErrorPopup = $ionicPopup.alert({
                                            title: 'Error',
                                            template: 'There was an error with the store. Please try again later.',
                                            okText: 'OK',
                                            okType: 'button-default'
                                        });
                                        iapSrv.currentErrorPopup.then(function(){
                                            iapSrv.currentErrorPopup = undefined;
                                        });
                                    }
                                }
                            });

                            if (InAppPurchaseHelperSrv.canUpgrade()){
                                $window.store.refresh();
                            }
                        }
                    })
                    .catch(function(err){
                        console.error('failed to init store products, err=' + err);
                    });

                };

                function offlineHandler() {
                    console.log('not online');
                    isOnline = false;
                }
                document.addEventListener('offline', offlineHandler, false);

                function onlineHandler() {
                    console.log('online');
                    isOnline = true;
                }
                document.addEventListener('online', onlineHandler, false);

                $timeout(function(){
                    iapSrv.initStore();
                },0);

                return iapSrv;
            }
        ];




    }]);
})(angular);