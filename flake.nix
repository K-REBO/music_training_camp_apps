{
  description = "Music Training Camp Apps - Development Environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    # Rust ツールチェーン管理
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true; # Playwrightなどのために必要
          overlays = [ rust-overlay.overlays.default ];
        };

        # Playwright用の環境変数
        playwrightEnv = {
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
        };

        # Rust ツールチェーン（stable + ARM64 クロスコンパイル対応）
        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" "clippy" "rustfmt" ];
          targets = [
            "x86_64-unknown-linux-gnu"      # ローカル開発
            "aarch64-unknown-linux-gnu"     # Raspberry Pi 4B (ARM64)
          ];
        };

        # ARM64 クロスコンパイル用ツールチェーン
        aarch64CC = pkgs.pkgsCross.aarch64-multiplatform.stdenv.cc;

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js環境
            nodejs_22
            pnpm

            # Deno
            deno

            # Playwright & ブラウザ
            playwright-driver.browsers

            # Rust ツールチェーン
            rustToolchain
            cargo-watch           # ファイル変更監視 + 自動リビルド
            sqlx-cli              # sqlx コマンド (migrate, prepare)

            # ARM64 クロスコンパイル用リンカー
            aarch64CC

            # 追加の開発ツール
            git

            # Playwrightの依存関係
            # これらはPlaywrightがFirefoxを実行するために必要
            at-spi2-atk
            cups
            dbus
            glib
            gtk3
            libdrm
            libxkbcommon
            mesa
            nspr
            nss
            pango
            xorg.libX11
            xorg.libXcomposite
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
            xorg.libxcb
            alsa-lib
            libpulseaudio
          ];

          shellHook = ''
            echo "🎵 Music Training Camp Apps - Development Environment"
            echo ""
            echo "Available tools:"
            echo "  - Node.js: $(node --version)"
            echo "  - pnpm: $(pnpm --version)"
            echo "  - Deno: $(deno --version | head -n1)"
            echo "  - Rust: $(rustc --version)"
            echo "  - Cargo: $(cargo --version)"
            echo "  - Playwright browsers: Firefox"
            echo ""
            echo "Environment variables:"
            echo "  PLAYWRIGHT_BROWSERS_PATH=${playwrightEnv.PLAYWRIGHT_BROWSERS_PATH}"
            echo ""
            echo "Quick start:"
            echo "  cd reservation && pnpm install && bun run dev"
            echo "  cd rust-backend && cargo build"
            echo ""
            echo "Rust cross-compile for Raspberry Pi (ARM64):"
            echo "  cd rust-backend && cargo build --release --target aarch64-unknown-linux-gnu"
            echo ""

            # Playwright環境変数の設定
            export PLAYWRIGHT_BROWSERS_PATH="${playwrightEnv.PLAYWRIGHT_BROWSERS_PATH}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS="true"

            # pnpmのストアディレクトリを設定（オプション）
            export PNPM_HOME="$HOME/.local/share/pnpm"
            export PATH="$PNPM_HOME:$PATH"

            # ARM64 クロスコンパイル用環境変数
            export CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER="${aarch64CC}/bin/aarch64-unknown-linux-gnu-cc"
            export CC_aarch64_unknown_linux_gnu="${aarch64CC}/bin/aarch64-unknown-linux-gnu-cc"
          '';

          # Playwrightが必要とする共有ライブラリのパス
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (with pkgs; [
            at-spi2-atk
            cups
            dbus
            glib
            gtk3
            libdrm
            libxkbcommon
            mesa
            nspr
            nss
            pango
            xorg.libX11
            xorg.libXcomposite
            xorg.libXdamage
            xorg.libXext
            xorg.libXfixes
            xorg.libXrandr
            xorg.libxcb
            alsa-lib
            libpulseaudio
          ]);
        };
      }
    );
}
