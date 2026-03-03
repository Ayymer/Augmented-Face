function setup() {
  // Use the full window size so the canvas fills the browser viewport
  createCanvas(windowWidth, windowHeight);
  background(100);
}

function draw() {
  circle(mouseX, mouseY, 20);
}

// Press 'r', 'Escape', 'Backspace' or 'Delete' to clear the canvas
function keyPressed() {
  // Accept uppercase or lowercase 'R'
  if (key === 'r' || key === 'R' || keyCode === ESCAPE || keyCode === BACKSPACE || keyCode === DELETE) {
    clearCanvas();
  }
}

function clearCanvas() {
  background(100);
  // Small visual feedback: flash text then disappear
  push();
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(24);
  text('Canvas cleared', width / 2, height / 2);
  pop();
  // Remove the message after a short delay by redrawing background
  setTimeout(() => {
    background(100);
  }, 500);
}

// Keep the canvas sized to the window when the user resizes the browser
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  background(100);
}
