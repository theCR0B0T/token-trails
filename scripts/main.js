// === CONFIG ===
const FOOTPRINT_CONFIG = {
  images: [
    "https://cdn-icons-png.flaticon.com/512/1/1275.png",  // Right foot
    "https://cdn-icons-png.flaticon.com/512/1/1293.png" // Left foot
  ],
  size: 0.33,
  fadeDuration: 6000,
  fadeSteps: 20,
  stepsPerGridSquare: 3,
  lateralOffsetFactor: 0.1
};

function angleBetween(p1, p2) {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

function getLateralOffset(x, y, angleDeg, distance, isLeft) {
  const angleRad = (angleDeg + 90) * (Math.PI / 180);
  const offset = isLeft ? distance : -distance;
  return {
    x: x + Math.cos(angleRad) * offset,
    y: y + Math.sin(angleRad) * offset
  };
}

// === MAIN HOOK ===
Hooks.on("updateToken", async (tokenDoc, updateData, options, userId) => {
  if (!("x" in updateData || "y" in updateData)) return;

  const token = canvas.tokens.get(tokenDoc.id);
  if (!token || token.document.hidden) return;
  if (token.document.movementAction != "walk") return;
  if ((token.document.elevation ?? 0) > 0) return;

  const waypoints = tokenDoc.movement.passed.waypoints;
  if (!waypoints || waypoints.length < 1) return;

  const fullPath = [
    { x: tokenDoc.x, y: tokenDoc.y },
    ...waypoints
  ];

  const gridSize = canvas.grid.size;
  const lateralOffset = FOOTPRINT_CONFIG.lateralOffsetFactor * gridSize;
  const stepSpacing = gridSize / FOOTPRINT_CONFIG.stepsPerGridSquare;

  const footprintTiles = [];
  let stepCount = 0;

  for (let i = 1; i < fullPath.length; i++) {
    const p1 = fullPath[i - 1];
    const p2 = fullPath[i];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.hypot(dx, dy);
    const angle = angleBetween(p1, p2);
    const steps = Math.floor(distance / stepSpacing);

    for (let j = 1; j <= steps; j++) {
      if (i === fullPath.length - 1 && j === steps) continue;

      const t = j / steps;
      const x = p1.x + dx * t;
      const y = p1.y + dy * t;
      const isLeft = stepCount % 2 === 0;
      const img = FOOTPRINT_CONFIG.images[isLeft ? 0 : 1];
      const pos = getLateralOffset(x, y, angle, lateralOffset, isLeft);

      footprintTiles.push({
        texture: { src: img },
        width: gridSize * FOOTPRINT_CONFIG.size,
        height: gridSize * FOOTPRINT_CONFIG.size,
        x: pos.x + (gridSize * FOOTPRINT_CONFIG.size),
        y: pos.y + (gridSize * FOOTPRINT_CONFIG.size),
        z: 100,
        alpha: 0.4,
        rotation: angle + 90,
        locked: true,
        overhead: false,
        hidden: false,
        flags: {
          footsteps: {
            isFootprint: true,
            tokenId: token.id,
            createdAt: Date.now()
          },
          'isometric-perspective': {
            isoTileDisabled: true
          }
        }
      });

      stepCount++;
    }
  }

  const created = await canvas.scene.createEmbeddedDocuments("Tile", footprintTiles);

  if (!game.combat?.started) {
    for (const tile of created) {
      fadeAndDeleteTile(tile.id, FOOTPRINT_CONFIG.fadeDuration, FOOTPRINT_CONFIG.fadeSteps);
    }
  }
});

// === REMOVE FOOTPRINTS AT TURN START ===
Hooks.on("updateCombat", async (combat, changed, options, userId) => {
  if (!("turn" in changed)) return;

  const currentTokenId = combat.combatant?.tokenId;
  if (!currentTokenId) return;

  const tilesToDelete = canvas.tiles.placeables.filter(tile =>
    tile.document.flags?.footsteps?.isFootprint &&
    tile.document.flags.footsteps.tokenId === currentTokenId
  );

  for (const tile of tilesToDelete) {
    fadeAndDeleteTile(tile.id, FOOTPRINT_CONFIG.fadeDuration, FOOTPRINT_CONFIG.fadeSteps);
  }
});

// === REMOVE ALL FOOTPRINTS ON COMBAT END ===
Hooks.on("deleteCombat", async (combat) => {
  const tilesToDelete = canvas.tiles.placeables.filter(tile =>
    tile.document.flags?.footsteps?.isFootprint
  );

  for (const tile of tilesToDelete) {
    fadeAndDeleteTile(tile.id, FOOTPRINT_CONFIG.fadeDuration, FOOTPRINT_CONFIG.fadeSteps);
  }
});

// === FADE + DELETE ===
async function fadeAndDeleteTile(tileId, duration, steps) {
  const interval = duration / steps;
  for (let step = 1; step <= steps; step++) {
    setTimeout(async () => {
      const tile = canvas.tiles.get(tileId);
      if (!tile) return;
      const newAlpha = Math.max(0, 1 - (step / steps));
      await tile.document.update({ alpha: newAlpha });
      if (step === steps) await tile.document.delete();
    }, step * interval);
  }
}