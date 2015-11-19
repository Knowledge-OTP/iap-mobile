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
            console.log('IAP EnableNoStoreMode: ' + enableNoStoreMode);
        };

        this.$get = [
            '$window', '$q', '$injector', '$filter', 'InAppPurchaseHelperSrv', 'ENV', '$analytics','$ionicLoading','$ionicPopup','$document','$timeout',
            function ($window, $q, $injector, $filter, InAppPurchaseHelperSrv, ENV, $analytics, $ionicLoading, $ionicPopup, $document, $timeout) {

                var iapStoreReadyDfd = $q.defer();
                var iapStoreReadyProm = iapStoreReadyDfd.promise;
                if (enableNoStoreMode === true){
                    iapStoreReadyDfd.resolve();
                }
                var registerdProductsPromArr = [];
                var isOnline = !!($window.navigator && $window.navigator.onLine);
                var validatorFunc;
                var isWeb = !$window.cordova;
                var appProductsCount = 0;
                var extendedProductMock = {
                    transaction: {
                        id:'demo'
                    },
                    price: '$30.99',
                    title: 'buy'
                };
                
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
                    purchaseInProgressProm: undefined,
                    IapErrorCodeEnum: {
                          CANCELLED: 0,
                          FAILED: 1,
                          VALIDATOR_FALSE: 2,
                          VALIDATOR_ERROR: 3
                    }
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

                iapSrv.getAppProduct = function(productId){
                    for (var i = 0; i < iapSrv.appProductsArr.length; i++) { 
                        if (iapSrv.appProductsArr[i].id === productId){
                            return iapSrv.appProductsArr[i];
                        }
                    }
                };

                iapSrv.getStoreProduct = function(productId){
                    return iapStoreReadyProm.then(function(){
                        return iapSrv.products[productId];    
                    });
                };

                iapSrv.getStoreProducts = function(){
                    return iapStoreReadyProm.then(function(){
                        var storeProductsArr = [];
                        // if (!isOnline) {
                        //     return $q.reject('No Internet connection');                        
                        // }

                        if (enableNoStoreMode || isWeb){
                            iapSrv.appProductsArr.forEach(function (appProduct){
                                var mockProductForWeb = {};
                                extendedProductMock.title = appProduct.id.replace('com.zinkerz.zinkerztoefl.','');
                                angular.extend(mockProductForWeb, appProduct, extendedProductMock);
                                storeProductsArr.push(angular.copy(mockProductForWeb));
                            });
                        }
                        else{
                            for(var propertyName in iapSrv.products) {
                                storeProductsArr.push(angular.copy(iapSrv.products[propertyName]));
                            }
                        }
                        return storeProductsArr;
                    });
                };

                iapSrv.getIapStoreReadyPromise = function(){
                    return iapStoreReadyProm;
                };
                
                iapSrv.purchase = function(productId){

                    return iapStoreReadyProm.then(function(){
                         iapSrv.purchaseInProgressProm = $q.defer();

                        if (enableNoStoreMode || isWeb){
                            var validator = _getValidatorFunc();
                            var mockProductForWeb = {};
                            var appProduct = iapSrv.getAppProduct(productId);

                            angular.extend(mockProductForWeb, appProduct, extendedProductMock);

                            validator(mockProductForWeb).then(function(res){
                                if (res){
                                    console.log('mock purchase completed');
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

                                iapSrv.currentErrorPopup.then(function(){
                                    iapSrv.currentErrorPopup = undefined;
                                });
                            });
                        }
                        else{

                            if (iapSrv.currentErrorPopup){
                                iapSrv.currentErrorPopup.close();
                            }

                            iapSrv.currentErrorPopup.then(function(){
                                iapSrv.currentErrorPopup = undefined;
                                iapSrv.purchaseInProgressProm.reject();
                            }); 
                        }
                        return iapSrv.purchaseInProgressProm.promise;
                    });
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
                iapSrv.initStore = function(){

                    if (enableNoStoreMode || isWeb){
                        initAppProductsForStore().then(function(appProductsArr){
                            if (angular.isArray(appProductsArr) && appProductsArr.length>0){
                                iapSrv.appProductsArr = appProductsArr;
                                console.log('app products loaded');
                            }
                            else{
                                console.error('failed to load app products');
                            }
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

                    var initAppProductsForStoreProm = initAppProductsForStore();
                    initAppProductsForStoreProm.catch(function (err) {
                        console.error('failed to load app products, err:' + err);
                        iapSrv.loadingError = true;
                        return;
                    });
                    initAppProductsForStoreProm.then(function (appProductsArr) {

                        if (angular.isArray(appProductsArr) && appProductsArr.length>0){
                            iapSrv.appProductsArr = appProductsArr;
                            console.log('app products loaded');
                        }
                        else{
                            console.error('failed to load app products');
                            return;
                        }

                        appProductsCount = appProductsArr.length;
                        
                        if (!iapSrv.initializedStore){
                            //TODO
                            iapSrv.initializedStore = true;



                            // iapSrv.appProductsArr.forEach(function (appProduct){

                            // });

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

                                    var validator = _getValidatorFunc();

                                    validator(product).then(function(res){
                                        $ionicLoading.hide();
                                        if (res){
                                            iapSrv.purchaseInProgressProm.resolve(product);
                                            callback(true, product);
                                            // if (iapSrv.isShowingModal){
                                            //     $ionicLoading.show({
                                            //         template: 'purchase verified'
                                            //     });
                                            //     $timeout(function(){
                                            //         $ionicLoading.hide();
                                            //     }, 2000);
                                            // }
                                        }
                                        else{
                                            console.error('store validator returned false');
                                            iapSrv.purchaseInProgressProm.reject(false);
                                            callback(false, {error: { code: iapSrv.IapErrorCodeEnum.VALIDATOR_FALSE , message: 'store validator returned false' }});
                                        }
                                    }).catch(function(err){
                                        console.error('error in store validator: ' + err);
                                        iapSrv.purchaseInProgressProm.reject(err);
                                        callback(false, {error: { code: iapSrv.IapErrorCodeEnum.VALIDATOR_ERROR , message: err }});
                                    });


                                }
                            };

                            /////////////////////////////
                            /////////////////////////////
                            // Register App products
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){

                                console.log('registering product: ' + JSON.stringify(appProduct));
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
                                    template: 'Purchase is in progress...'
                                });
                                console.log('Purchase is in progress...');
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
                                if (iapSrv.purchaseInProgressProm){
                                    iapSrv.purchaseInProgressProm.reject({code:iapSrv.IapErrorCodeEnum.CANCELLED,  message: 'purchase cancelled'});
                                }
                            };
                            
                            /////////////////////////////
                            /////////////////////////////
                            // Cancelled and Refunded App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){
                                $window.store.when(appProduct.id).cancelled(function(product){
                                    purchaseCancelled(product);                               
                                });
                                $window.store.when(appProduct.id).refunded(function(product){
                                    console.log('purchase refunded, product:' + product.id);                               
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Updated and Finished App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){
                                $window.store.when(appProduct.id).updated(function(product){
                                    console.log('product updated: ' + product.id);
                                    iapSrv.products[product.id] = product;
                                });
                                $window.store.when(appProduct.id).finished(function(product){
                                    console.log('product finished: ' + product.id);
                                });
                                $window.store.when(appProduct.id).registered(function(product){
                                    console.log('product registered: ' + product.id);
                                    registerdProductsPromArr.push($q.when(product.id));
                                    if (registerdProductsPromArr.length === appProductsCount){
                                        iapStoreReadyDfd.resolve();
                                    }
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Store error
                            /////////////////////////////
                            /////////////////////////////

                            $window.store.error(function(err){
                                $ionicLoading.hide();
                                if (iapSrv.purchaseInProgressProm){
                                    iapSrv.purchaseInProgressProm.reject(err);
                                }
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