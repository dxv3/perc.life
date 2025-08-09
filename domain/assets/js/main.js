document.addEventListener("DOMContentLoaded", function () {
    setInterval(loop, 1000);
});

var x = 0;
var titleText = ["‎", "dxv3! "];

function loop() {
    document.title = titleText[x++ % titleText.length];
}
