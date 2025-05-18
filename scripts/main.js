// === CONFIGURAÇÕES GLOBAIS ===
const FOOTPRINT_CONFIG = {
    image: "https://upload.wikimedia.org/wikipedia/commons/2/2b/Footprints.png",
    size: 1, // unidades de grade
    fadeDuration: 6000, // ms
    fadeSteps: 20
  };
  
  // === AJUDA: CENTRALIZA NA GRADE ===
  function snapToGridCenter(x, y) {
    const gs = canvas.grid.size;
    return {
      x: Math.floor(x / gs) * gs,
      y: Math.floor(y / gs) * gs
    };
  }
  
  // === CRIA PEGADAS AO MOVER ===
  Hooks.on("updateToken", async (tokenDoc, updateData, options, userId) => {
    if (!("x" in updateData || "y" in updateData)) return;
  
    const token = canvas.tokens.get(tokenDoc.id);
    if (!token || token.document.hidden) return;
    if ((token.document.elevation ?? 0) > 0) return;
  
    const startX = tokenDoc.x;
    const startY = tokenDoc.y;
    const endX = updateData.x ?? startX;
    const endY = updateData.y ?? startY;
  
    const gridSize = canvas.grid.size;
    const dx = endX - startX;
    const dy = endY - startY;
    const dist = Math.hypot(dx, dy);
    const steps = Math.ceil(dist / gridSize);
  
    const footprintTiles = [];
  
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const interpX = startX + dx * t;
      const interpY = startY + dy * t;
      const { x, y } = snapToGridCenter(interpX, interpY);
  
      // Impede criação duplicada
      const alreadyExists = canvas.tiles.placeables.some(t =>
        t.document.flags?.footsteps?.isFootprint &&
        t.document.x === x &&
        t.document.y === y
      );
      if (alreadyExists) continue;
  
      footprintTiles.push({
        texture: { src: FOOTPRINT_CONFIG.image },
        width: gridSize * FOOTPRINT_CONFIG.size,
        height: gridSize * FOOTPRINT_CONFIG.size,
        x: x,
        y: y,
        z: 100,
        alpha: 0.8,
        locked: true,
        overhead: false,
        hidden: false,
        flags: {
          footsteps: {
            isFootprint: true,
            tokenId: token.id,
            createdAt: Date.now()
          }
        }
      });
    }
  
    const created = await canvas.scene.createEmbeddedDocuments("Tile", footprintTiles);
  
    // === FADE AUTOMÁTICO FORA DE COMBATE ===
    if (!game.combat?.started) {
      for (const tile of created) {
        fadeAndDeleteTile(tile.id, FOOTPRINT_CONFIG.fadeDuration, FOOTPRINT_CONFIG.fadeSteps);
      }
    }
  });
  
  // === LIMPA PEGADAS NO PRÓXIMO TURNO DO MESMO TOKEN ===
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
  
  // === REMOVE FOOTPRINTS ON COMBAT ENDING ===
  Hooks.on("deleteCombat", async (combat) => {
    const tilesToDelete = canvas.tiles.placeables.filter(tile =>
      tile.document.flags?.footsteps?.isFootprint
    );
  
    for (const tile of tilesToDelete) {
      fadeAndDeleteTile(tile.id, FOOTPRINT_CONFIG.fadeDuration, FOOTPRINT_CONFIG.fadeSteps);
    }
  });
  
  // === FADE + REMOÇÃO ===
  async function fadeAndDeleteTile(tileId, duration, steps) {
    const interval = duration / steps;
    for (let step = 1; step <= steps; step++) {
      setTimeout(async () => {
        const tile = canvas.tiles.get(tileId);
        if (!tile) return;
        const newAlpha = Math.max(0, 1 - (step / steps));
        await tile.document.update({ alpha: newAlpha });
  
        if (step === steps) {
          await tile.document.delete();
        }
      }, step * interval);
    }
  }