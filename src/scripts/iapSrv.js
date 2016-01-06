(function (angular) {
    'use strict';

    angular.module('znk.iap').provider('IapSrv', [ 
        '$logProvider',
        function ($logProvider) {
        
        var productsGetter;
        var validatorFuncRef;
        var enableNoStoreMode;
        var enableRecipetValidation=false;
        var enableDebug =false;
        var validationUrl;

        $logProvider.debugEnabled(enableDebug);
        var $log = angular.injector(['ng']).get('$log');

        this.registerProducts = function(fnOrArr){
            productsGetter = fnOrArr;
        };

        this.enableDebug = function(shouldEnableDebug){
            enableDebug = shouldEnableDebug;
            $logProvider.debugEnabled(enableDebug);
        };

        this.setValidator = function(func){
            validatorFuncRef = func;
        };
        
        this.setNoStoreMode = function(shouldEnableNoStoreMode){
            enableNoStoreMode = shouldEnableNoStoreMode;
            $log.debug('IAP EnableNoStoreMode: ' + enableNoStoreMode);
        };

        this.setEnableRecipetValidation = function(shouldEnableRecipetValidation){
            enableRecipetValidation = shouldEnableRecipetValidation;
        };

        this.setValidationUrl = function(url){
            validationUrl = url;
        };

        this.$get = [
            '$window', '$q', '$injector', '$filter', 'InAppPurchaseHelperSrv', 'ENV', '$analytics','$ionicLoading','$ionicPopup','$document','$timeout', '$http',
            function ($window, $q, $injector, $filter, InAppPurchaseHelperSrv, ENV, $analytics, $ionicLoading, $ionicPopup, $document, $timeout, $http) {
                
                var isWeb = !$window.cordova;
                var iapStoreReadyDfd = $q.defer();
                var iapStoreReadyProm = iapStoreReadyDfd.promise;
                var iapStoreTimedOut = false;
                var iapStoreReadyTimeout = $timeout(function(){
                    iapStoreTimedOut = true;
                    if (angular.isDefined(iapStoreReadyDfd)){
                        iapStoreReadyDfd.reject('store timeout');
                    }
                },15000);
                if (enableNoStoreMode || isWeb){
                    if(!iapStoreTimedOut){
                        $timeout.cancel(iapStoreReadyTimeout);
                        iapStoreReadyDfd.resolve();
                    }
                }
                var isOnline = !!($window.navigator && $window.navigator.onLine);
                var validatorFunc;
                
                var extendedProductMock = {
                    transaction: {
                        id:'demo'
                    },
                    price: '$30.99',
                    title: 'buy'
                };
                var PlatfromEnum = {
                    IOS: 0,
                    ANDROID: 1,
                    UNKNOWN: 2
                };
                
                var iapSrv = {
                    initializedStore: false,
                    //store products, updated only by store update event handelr
                    products: {},
                    //application products (not store products)
                    appProductsArr: [],
                    isPurchaseInProgress: false,
                    purchaseInProgressDfd: undefined,
                    IapErrorCodeEnum: {
                          CANCELLED: 0,
                          FAILED: 1,
                          VALIDATOR_FALSE: 2,
                          VALIDATOR_ERROR: 3,
                          VALIDATOR_NO_TRANSACTION: 4,
                          RECIPT_NOT_APPROVED: 5
                    }
                };

                // function _isValidProduct(product){
                //     return (product && product.title && product.price){
                // }

                function _verifyReciept(transaction){

                    var platform = _getPlatform(transaction.type);
                    var transactionData;
                    if (platform === PlatfromEnum.UNKNOWN){
                        return $q.reject('unknown platform');
                    }
                    else{

                        switch(platform){
                            case 'apple':
                                transactionData = {
                                    'appleReceipt' : transaction.appStoreReceipt
                                };
                                break;
                            case 'google':
                                transactionData = {
                                    'signature' : transaction.signature,
                                    'receiptData' : transaction.receipt
                                };
                                break;
                        }
                        
                        return $http.post(validationUrl+'verify/'+ platform, {'transaction': transaction}).then(function(res) {
                            return res;
                        }, function(error) {
                               return $q.reject(error);
                        });
                    }
                }

                function _getValidatorFunc(){
                    if (!validatorFunc){
                        validatorFunc = $injector.invoke(validatorFuncRef);
                    }
                    return validatorFunc;
                }

                function _getAppProducts(){
                    $log.debug('_getAppProducts');
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
                        // if (_isValidProduct(iapSrv.products[productId])){
                            return iapSrv.products[productId];    
                        // }
                        // else{
                        //     return null;
                        // }
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
                                // if (_isValidProduct(iapSrv.products[propertyName])){
                                    storeProductsArr.push(angular.copy(iapSrv.products[propertyName]));
                                // }
                            }
                        }
                        return storeProductsArr;
                    });
                };

                iapSrv.getIapStoreReadyPromise = function(){
                    return iapStoreReadyProm;
                };
                
                iapSrv.purchase = function(productId){

                    $log.debug('starting purchase');

                    return iapStoreReadyProm.then(function(){
                        $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                        if (iapSrv.isPurchaseInProgress){
                            $log.debug('purchase is already in progress');
                            return $q.reject(false);
                        }
                        iapSrv.isPurchaseInProgress = true;
                        iapSrv.purchaseInProgressDfd = $q.defer();
                        $ionicLoading.show({
                            template: 'Purchase is in progress...'
                        });

                        if (enableNoStoreMode || isWeb){
                            var validator = _getValidatorFunc();
                            var mockProductForWeb = {};
                            var appProduct = iapSrv.getAppProduct(productId);

                            angular.extend(mockProductForWeb, appProduct, extendedProductMock);

                            validator(mockProductForWeb).then(function(res){
                                if (res){
                                    $log.debug('mock purchase completed');
                                    iapSrv.purchaseInProgressDfd.resolve(appProduct);
                                    iapSrv.isPurchaseInProgress = false;
                                    $ionicLoading.hide();
                                    $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                }
                                else{
                                    $log.debug('error in validating mock purchase');
                                    iapSrv.purchaseInProgressDfd.reject();
                                    iapSrv.isPurchaseInProgress = false;
                                    $ionicLoading.hide();
                                    $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                }
                            })
                            .catch(function(err){
                                $log.debug('error in mock purchase, err: ' + err);
                                iapSrv.purchaseInProgressDfd.reject(err);
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                            });
                            return iapSrv.purchaseInProgressDfd.promise;
                        }
                        
                        var product = iapSrv.products[productId];

                        if (product){
                            $window.store.order(product.id).error(function(err){
                                $log.debug('error in purchase, store.order, err:' + err);
                                $analytics.eventTrack('store-order-error', { category: 'purchase', label: err});
                                iapSrv.purchaseInProgressDfd.reject(err);
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                            });
                        }
                        else{
                            $log.debug('error in purchase, no product');
                            iapSrv.purchaseInProgressDfd.reject();
                            iapSrv.isPurchaseInProgress = false;
                            $ionicLoading.hide();
                            $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                        }
                        return iapSrv.purchaseInProgressDfd.promise;
                    });
                };

                //TODO - protect by promise, two simaltonasily will crash the app
                // iapSrv.refreshStore = function refreshStore(){

                //     if (InAppPurchaseHelperSrv.canUpgrade()){
                //         $log.debug('refresh store initiated');
                //         if (!iapSrv.initializedStore){
                //             iapSrv.initStore();
                //         }
                //         else{
                //             $window.store.refresh();
                //         }
                //     }
                //     else{
                //         $log.debug('user cannot upgrade at this time');
                //     }
                // };

                function initAppProductsForStore(){
                    $log.debug('init app products for the store');
                    return _getAppProducts();
                }

                function _getPlatform(transactionType) {
                    switch (angular.lowercase(transactionType)) {
                        case 'ios-appstore':
                            return 'apple';
                        case 'android-playstore':
                            return 'google';
                        default:
                            return PlatfromEnum.UNKNOWN;
                    }
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
                                $log.debug('app products loaded');
                            }
                            else{
                                $log.error('failed to load app products');
                            }
                        })
                        .catch(function(err) {
                            $log.error('failed to load app products, err:' + err);
                        });
                        return;
                    }
                    
                    if (!$window.store){
                        $log.debug('store is not available');
                        if (angular.isDefined(iapStoreReadyDfd)){
                            if (!iapStoreTimedOut){
                               iapStoreReadyDfd.reject(); 
                            }
                        }
                        return;
                    }
                    else{
                        $log.debug('initializing store');
                    }

                    if (enableRecipetValidation){
                        if (!angular.isString(validationUrl) ||  validationUrl.length===0){
                            if (!iapStoreTimedOut){
                               iapStoreReadyDfd.reject(); 
                            }

                        }
                    }

                    var initAppProductsForStoreProm = initAppProductsForStore();
                    initAppProductsForStoreProm.catch(function(err) {
                        $log.error('failed to load app products, err:' + err);
                        if (angular.isDefined(iapStoreReadyDfd)){
                            if (!iapStoreTimedOut){
                                iapStoreReadyDfd.reject(err);
                            }
                        }
                        return;
                    });
                    initAppProductsForStoreProm.then(function(appProductsArr){

                        if (angular.isArray(appProductsArr) && appProductsArr.length>0){
                            iapSrv.appProductsArr = appProductsArr;
                            $log.debug('app products loaded');
                        }
                        else{
                            $log.error('failed to load app products');
                            if (angular.isDefined(iapStoreReadyDfd)){
                                if (!iapStoreTimedOut){
                                    iapStoreReadyDfd.reject();
                                }
                            }
                            return;
                        }

                        if (!iapSrv.initializedStore){
                            //TODO
                            iapSrv.initializedStore = true;

                            $window.store.verbosity = ENV.debug ? $window.store.DEBUG : $window.store.QUIET;

                            /////////////////////////////
                            /////////////////////////////
                            //store.validator
                            /////////////////////////////
                            /////////////////////////////
                            
                            $window.store.validator = function(product, callback){

                                $log.debug('performing validator');
                                if (product.type === $window.store.PAID_SUBSCRIPTION && product.owned){
                                    callback(false, {code: $window.store.PURCHASE_EXPIRED, error: { code: iapSrv.IapErrorCodeEnum.RECIPT_NOT_APPROVED , message: 'subscription already owned' }});
                                    return;
                                }
                                var verifyRecieptProm;
                                
                                if (product.transaction){
                                    $log.debug('new transaction, transaction:' + JSON.stringify(product.transaction));
                                    
                                    if (enableRecipetValidation){
                                        $log.debug('enableRecipetValidation is true');
                                        verifyRecieptProm = _verifyReciept(product.transaction);
                                    }
                                    else{
                                        verifyRecieptProm = $q.when(true);
                                    }

                                    verifyRecieptProm.then(function(res){
                                        $log.debug('verifyRecieptProm returned ' + res);
                                        if (res && res.data && res.data.ok){
                                            callback(true,res.data.data);
                                        }
                                        else{
                                            if (product.type === $window.store.PAID_SUBSCRIPTION){
                                                callback(false, {code: $window.store.PURCHASE_EXPIRED, error: { code: iapSrv.IapErrorCodeEnum.RECIPT_NOT_APPROVED , message: 'recipt not approved' }});
                                            }
                                            else{
                                                callback(false, {error: { code: iapSrv.IapErrorCodeEnum.RECIPT_NOT_APPROVED , message: 'recipt not approved' }});
                                            }
                                        }
                                    })
                                    .catch(function(err){
                                        $log.error('error in verifyRecieptProm validator: ' + err);
                                        if (product.type === $window.store.PAID_SUBSCRIPTION){
                                            callback(false, {code: $window.store.PURCHASE_EXPIRED, error: { code: iapSrv.IapErrorCodeEnum.RECIPT_NOT_APPROVED , message: 'recipt not approved' }});
                                        }
                                        else{
                                            callback(false, {error: { code: iapSrv.IapErrorCodeEnum.RECIPT_NOT_APPROVED , message: 'recipt not approved' }});
                                        }
                                    });                                    
                                }
                                else{
                                    $log.debug('no transaction in validator');
                                    if (product.type === $window.store.PAID_SUBSCRIPTION){
                                        callback(false, {code: $window.store.PURCHASE_EXPIRED, error: { code: iapSrv.IapErrorCodeEnum.VALIDATOR_NO_TRANSACTION , message: 'no transaction in validator' }});
                                    }
                                    else{
                                        callback(false, {error: { code: iapSrv.IapErrorCodeEnum.VALIDATOR_NO_TRANSACTION , message: 'no transaction in validator' }});
                                    }
                                }
                            };

                            // Example for url validator
                            // $window.store.validator = 'https://znk-apps-backend-dev.azurewebsites.net/verify/google';
                               

                            /////////////////////////////
                            /////////////////////////////
                            // Register App products
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct){

                                $log.debug('registering product: ' + JSON.stringify(appProduct));
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
                                $log.debug('purchase approved');
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

                                $window.store.when($window.store.PAID_SUBSCRIPTION).updated(function (product) {
                                    $log.debug('---------- proudctId:' + product.id + ',owned:' + product.owned);
                                 });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Verified App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).verified(function(product){
                                    $log.debug('purchase verified');
                                    $analytics.eventTrack('purchase-recipt-verified',{ category: 'purchase', label:'verified'});
                                    var validator = _getValidatorFunc();
                                    if (!angular.isFunction(validator)){
                                        $log.error('_getValidatorFunc returned no function');
                                        if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                            iapSrv.purchaseInProgressDfd.reject(false);
                                        }
                                        iapSrv.isPurchaseInProgress = false;
                                        $ionicLoading.hide();
                                        $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                    }
                                    else{
                                        //TODO - CHECK IOS AND ANDROID TRANSACTIONS DATA
                                        // if (angular.isDefined(product.transaction.orderId)){
                                        // }

                                        validator(product).then(function(res){
                                            $ionicLoading.hide();
                                            if (res){
                                                $log.debug('app validator returned true');
                                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                                    iapSrv.purchaseInProgressDfd.resolve(product);
                                                }
                                                iapSrv.isPurchaseInProgress = false;
                                                $ionicLoading.hide();
                                                $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                                product.finish();
                                            }
                                            else{
                                                $log.error('app validator returned false');
                                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                                    iapSrv.purchaseInProgressDfd.reject(false);
                                                }
                                                iapSrv.isPurchaseInProgress = false;
                                                $ionicLoading.hide();
                                                $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                            }
                                        }).catch(function(err){
                                            $log.error('error in app validator: ' + err);
                                            $analytics.eventTrack('store-validator-error', { category: 'purchase', label: err});
                                            if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                                iapSrv.purchaseInProgressDfd.reject(err);
                                            }
                                            iapSrv.isPurchaseInProgress = false;
                                            $ionicLoading.hide();
                                            $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                        });
                                    }
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Unverified App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).unverified(function(){
                                    $log.debug('purchase unverified');
                                    $analytics.eventTrack('purchase-unverified', { category: 'purchase', label: 'unverified'});
                                    $log.error('store recipt no validated');
                                    if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                        iapSrv.purchaseInProgressDfd.reject();
                                    }
                                    iapSrv.isPurchaseInProgress = false;
                                    $ionicLoading.hide();
                                    $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                            
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Initiated App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            iapSrv.appProductsArr.forEach(function (appProduct) {
                                $window.store.when(appProduct.id).initiated(function(){
                                    $log.debug('purchase initiated...');                              
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // purchaseCancelled
                            /////////////////////////////
                            /////////////////////////////

                            var purchaseCancelled = function purchaseCancelled(){
                                $log.debug('purchase cancelled');
                                $analytics.eventTrack('cancel-purchase',{ category: 'purchase' , label: 'cancelled' });
                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                    iapSrv.purchaseInProgressDfd.reject({code:iapSrv.IapErrorCodeEnum.CANCELLED,  message: 'purchase cancelled'});
                                }
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
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
                                    $log.debug('purchase refunded, product:' + product.id);                               
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Updated and Finished App products Handler
                            /////////////////////////////
                            /////////////////////////////

                            $window.store.ready(function(){
                                $log.debug('-----store is ready-----');
                                if(!iapStoreTimedOut){
                                    $timeout.cancel(iapStoreReadyTimeout);
                                    if (angular.isDefined(iapStoreReadyDfd)){
                                        iapStoreReadyDfd.resolve();
                                    }
                                    
                                }
                            }); 

                            iapSrv.appProductsArr.forEach(function (appProduct){
                                $window.store.when(appProduct.id).updated(function(product){
                                    $log.debug('product updated: ' + product.id);
                                    iapSrv.products[product.id] = product;
                                });
                                $window.store.when(appProduct.id).finished(function(product){
                                    $log.debug('product finished: ' + product.id);
                                    $analytics.eventTrack('purchased', { category: 'purchase', label:product.id });
                                    //hack - for android purposes only
                                    $analytics.pageTrack('product-purchased/' + product.id);
                                });
                            });

                            /////////////////////////////
                            /////////////////////////////
                            // Store error
                            /////////////////////////////
                            /////////////////////////////

                            $window.store.error(function(err){
                                $log.debug('store-error ' + err.code + ': ' + err.message);
                                $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                                $analytics.eventTrack('store-error', { category: 'purchase', label: err});
                                if (angular.isDefined(iapSrv.purchaseInProgressDfd)){
                                    iapSrv.purchaseInProgressDfd.reject(err);
                                }
                                iapSrv.isPurchaseInProgress = false;
                                $ionicLoading.hide();
                                $log.debug('purchase: isPurchaseInProgress=' + iapSrv.isPurchaseInProgress);
                            
                                if (angular.isDefined(iapStoreReadyDfd)){
                                    if (!iapStoreTimedOut){
                                        iapStoreReadyDfd.reject(err);
                                    }
                                }
                            });
                           $window.store.refresh();
                        }
                    })
                    .catch(function(err){
                        if (angular.isDefined(iapStoreReadyDfd)){
                            if (!iapStoreTimedOut){
                                iapStoreReadyDfd.reject(err);
                            }
                        }
                        $log.error('failed to init store products, err=' + err);
                    });

                };

                function offlineHandler() {
                    $log.debug('not online');
                    isOnline = false;
                }
                document.addEventListener('offline', offlineHandler, false);

                function onlineHandler() {
                    $log.debug('online');
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