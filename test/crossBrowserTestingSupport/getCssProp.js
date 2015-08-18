function css(element,prop,withoutPxSuffix){
    var htmlElement = element[0];
    var style = htmlElement.style || htmlElement.currentStyle || window.getComputedStyle(htmlElement);
    var val = style[prop];
    return withoutPxSuffix ? numWithoutPixels(val) : val;
}
/**
 * cut the 'px' suffix of the given val
 */
function numWithoutPixels(val){
    if(!val){
        return '';
    }
    return +(val.match(/^(.*)px$/)[1]);
}
