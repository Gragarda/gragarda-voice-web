use df::tract::{DfParams, DfTract, RuntimeParams};
use ndarray::{ArrayView2, ArrayViewMut2};
use wasm_bindgen::prelude::*;

/// Retard interne de DeepFilterNet 3 (mesure : 3 trames de 480 a 48 kHz), compense ici.
const DELAY: usize = 1440;

/// Debruite `x` (mono 48 kHz) en place. `atten_lim_db` : attenuation max du bruit (100 = sans limite).
#[wasm_bindgen]
pub fn denoise(x: &mut [f32], atten_lim_db: f32) -> Result<(), JsError> {
    let rp = RuntimeParams::default_with_ch(1).with_atten_lim(atten_lim_db);
    let mut m = DfTract::new(DfParams::default(), &rp).map_err(|e| JsError::new(&e.to_string()))?;
    let hop = m.hop_size;
    let n = x.len();
    // entree completee de zeros pour sortir aussi les DELAY derniers echantillons
    let total = (n + DELAY).div_ceil(hop) * hop;
    let mut inp = vec![0.0f32; total];
    inp[..n].copy_from_slice(x);
    let mut out = vec![0.0f32; hop];
    for (f, chunk) in inp.chunks(hop).enumerate() {
        let noisy = ArrayView2::from_shape((1, hop), chunk).unwrap();
        let enh = ArrayViewMut2::from_shape((1, hop), &mut out[..]).unwrap();
        m.process(noisy, enh).map_err(|e| JsError::new(&e.to_string()))?;
        for (k, v) in out.iter().enumerate() {
            let i = f * hop + k;
            if i >= DELAY && i - DELAY < n {
                x[i - DELAY] = *v;
            }
        }
    }
    Ok(())
}
