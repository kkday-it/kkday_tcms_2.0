"""
Unit tests for the USE_LOCAL_DB / USE_QA_DATABASE_SECRET resolution helpers.

Backwards-compat matrix (see app/core/config.py:_parse_db_flag):

    legacy (USE_QA_DATABASE_SECRET) | current (USE_LOCAL_DB) | result | deprecation?
    -------------------------------- | ----------------------- | ------ | -------------
    None (unset)                    | None (unset)            | True   | no
    None                            | True                    | True   | no
    None                            | False                   | False  | no
    True                            | None                    | False  | yes
    False                           | None                    | True   | yes
    True                            | True (ignored)          | False  | yes
    False                           | False (ignored)         | True   | yes
"""

import warnings
import pytest

from app.core.config import _parse_db_flag, _parse_env_bool, env_use_local_db


class TestParseDbFlag:
    def test_default_both_none(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error", DeprecationWarning)
            assert _parse_db_flag(None, None) is True

    def test_current_true(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error", DeprecationWarning)
            assert _parse_db_flag(None, True) is True

    def test_current_false(self):
        with warnings.catch_warnings():
            warnings.simplefilter("error", DeprecationWarning)
            assert _parse_db_flag(None, False) is False

    def test_legacy_true_emits_deprecation_and_maps_to_false(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", DeprecationWarning)
            assert _parse_db_flag(True, None) is False
            deps = [w for w in caught if issubclass(w.category, DeprecationWarning)]
            assert len(deps) == 1
            assert "USE_QA_DATABASE_SECRET is deprecated" in str(deps[0].message)

    def test_legacy_false_emits_deprecation_and_maps_to_true(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", DeprecationWarning)
            assert _parse_db_flag(False, None) is True
            assert any(issubclass(w.category, DeprecationWarning) for w in caught)

    def test_legacy_wins_over_current_when_both_set(self):
        """既有部署優先 — 兩者並存時舊名決定行為，避免破壞 prod。"""
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", DeprecationWarning)
            assert _parse_db_flag(True, True) is False  # legacy=True (remote) overrides current=True (local)
            assert _parse_db_flag(False, False) is True  # legacy=False (local) overrides current=False (remote)
            assert any(issubclass(w.category, DeprecationWarning) for w in caught)


class TestParseEnvBool:
    @pytest.mark.parametrize("value", ["true", "TRUE", "True", "1", "yes", "YES"])
    def test_truthy_variants(self, value, monkeypatch):
        monkeypatch.setenv("X_TEST", value)
        assert _parse_env_bool("X_TEST") is True

    @pytest.mark.parametrize("value", ["false", "FALSE", "False", "0", "no", "NO"])
    def test_falsy_variants(self, value, monkeypatch):
        monkeypatch.setenv("X_TEST", value)
        assert _parse_env_bool("X_TEST") is False

    def test_unset_returns_none(self, monkeypatch):
        monkeypatch.delenv("X_TEST", raising=False)
        assert _parse_env_bool("X_TEST") is None

    def test_unrecognised_returns_none(self, monkeypatch):
        monkeypatch.setenv("X_TEST", "maybe")
        assert _parse_env_bool("X_TEST") is None


class TestEnvUseLocalDb:
    """Integration smoke test through env_use_local_db() — exercises the os.environ path."""

    def test_no_env_defaults_to_local(self, monkeypatch):
        monkeypatch.delenv("USE_LOCAL_DB", raising=False)
        monkeypatch.delenv("USE_QA_DATABASE_SECRET", raising=False)
        assert env_use_local_db() is True

    def test_new_flag_false_means_remote(self, monkeypatch):
        monkeypatch.delenv("USE_QA_DATABASE_SECRET", raising=False)
        monkeypatch.setenv("USE_LOCAL_DB", "false")
        assert env_use_local_db() is False

    def test_legacy_true_overrides_new_flag(self, monkeypatch):
        monkeypatch.setenv("USE_QA_DATABASE_SECRET", "true")
        monkeypatch.setenv("USE_LOCAL_DB", "true")
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always", DeprecationWarning)
            assert env_use_local_db() is False  # legacy=true wins → remote
            assert any(issubclass(w.category, DeprecationWarning) for w in caught)
