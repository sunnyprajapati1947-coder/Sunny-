"""Writes a tiny RANDOM-WEIGHT llama-architecture GGUF for protocol smoke tests only.

It is NOT a useful model (its answers are noise). It lets the real llama-server binary load a file,
serve /v1/chat/completions and answer, so Nova's HTTP client, parsing and fallback paths can be
tested without downloading a multi-hundred-MB model. Requires: pip install gguf numpy
Usage: python make_tiny_gguf.py OUT.gguf
"""

from __future__ import annotations

import sys

import gguf  # type: ignore
import numpy as np

N_EMBD, N_FF, N_LAYER, N_HEAD, VOCAB = 64, 128, 1, 4, 260


def build(path: str) -> None:
    rng = np.random.default_rng(0)
    w = gguf.GGUFWriter(path, "llama")
    w.add_name("nova-tiny-random")
    w.add_context_length(16384)
    w.add_embedding_length(N_EMBD)
    w.add_block_count(N_LAYER)
    w.add_feed_forward_length(N_FF)
    w.add_head_count(N_HEAD)
    w.add_head_count_kv(N_HEAD)
    w.add_rope_dimension_count(N_EMBD // N_HEAD)
    w.add_layer_norm_rms_eps(1e-5)
    w.add_vocab_size(VOCAB)
    w.add_file_type(gguf.LlamaFileType.ALL_F32)

    tokens = ["<unk>", "<s>", "</s>"] + [f"<0x{i:02X}>" for i in range(256)]
    tokens += [f"tok{i}" for i in range(VOCAB - len(tokens))]
    types = [2, 3, 3] + [6] * 256 + [1] * (VOCAB - 259)
    w.add_tokenizer_model("llama")
    w.add_token_list(tokens)
    w.add_token_scores([0.0] * VOCAB)
    w.add_token_types(types)
    w.add_bos_token_id(1)
    w.add_eos_token_id(2)
    w.add_unk_token_id(0)

    def t(shape):
        return (rng.standard_normal(shape) * 0.05).astype(np.float32)

    w.add_tensor("token_embd.weight", t((VOCAB, N_EMBD)))
    w.add_tensor("output_norm.weight", np.ones((N_EMBD,), dtype=np.float32))
    w.add_tensor("output.weight", t((VOCAB, N_EMBD)))
    for i in range(N_LAYER):
        p = f"blk.{i}."
        w.add_tensor(p + "attn_norm.weight", np.ones((N_EMBD,), dtype=np.float32))
        for name in ("attn_q", "attn_k", "attn_v", "attn_output"):
            w.add_tensor(p + name + ".weight", t((N_EMBD, N_EMBD)))
        w.add_tensor(p + "ffn_norm.weight", np.ones((N_EMBD,), dtype=np.float32))
        w.add_tensor(p + "ffn_gate.weight", t((N_FF, N_EMBD)))
        w.add_tensor(p + "ffn_up.weight", t((N_FF, N_EMBD)))
        w.add_tensor(p + "ffn_down.weight", t((N_EMBD, N_FF)))
    w.write_header_to_file()
    w.write_kv_data_to_file()
    w.write_tensors_to_file()
    w.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    build(sys.argv[1])
    print("wrote", sys.argv[1])
