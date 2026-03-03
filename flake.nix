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
    # Rust パッケージビルド（クロスコンパイル対応）
    crane = {
      url = "github:ipetkov/crane";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay, crane }:
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

        # ARM64 クロスコンパイル用リンカー
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
            echo "Deploy to Raspberry Pi:"
            echo "  nix build .#rust-backend-pi   # ARM64 バイナリをビルド"
            echo "  ./deploy-to-pi.sh              # Pi へ転送して起動"
            echo ""

            # Playwright環境変数の設定
            export PLAYWRIGHT_BROWSERS_PATH="${playwrightEnv.PLAYWRIGHT_BROWSERS_PATH}"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS="true"

            # pnpmのストアディレクトリを設定（オプション）
            export PNPM_HOME="$HOME/.local/share/pnpm"
            export PATH="$PNPM_HOME:$PATH"

            # ARM64 クロスコンパイル用環境変数（cargo build --target 使用時）
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

        # ── Raspberry Pi 向け ARM64 パッケージ（x86-64 マシンからクロスビルド）─
        # 使い方:
        #   nix build .#rust-backend-pi           # ARM64 バイナリをビルド
        #   nix build .#rust-backend-pi-import    # データ移行用バイナリ
        packages = pkgs.lib.optionalAttrs (system == "x86_64-linux") (
          let
            # crane に ARM64 クロスコンパイル用ツールチェーンを与える
            craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchain;

            # rust-backend のソース（.sqlx/ キャッシュを含む）
            src = pkgs.lib.cleanSourceWith {
              src = ./rust-backend;
              filter = path: type:
                # .sqlx ディレクトリ自体とその中身を含める（SQLX_OFFLINE ビルドに必要）
                # 末尾スラッシュなしでマッチさせることでディレクトリ自体もマッチする
                (pkgs.lib.hasInfix "/.sqlx" path) ||
                (craneLib.filterCargoSources path type);
            };

            # クロスコンパイル共通の引数
            commonArgs = {
              inherit src;
              strictDeps = true;
              doCheck = false;

              CARGO_BUILD_TARGET = "aarch64-unknown-linux-gnu";
              CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER =
                "${aarch64CC}/bin/aarch64-unknown-linux-gnu-cc";
              CC_aarch64_unknown_linux_gnu =
                "${aarch64CC}/bin/aarch64-unknown-linux-gnu-cc";
              SQLX_OFFLINE = "true";
            };

            # 依存クレートだけ先にビルド（キャッシュ効率化）
            cargoArtifacts = craneLib.buildDepsOnly commonArgs;
          in
          {
            # メインサーバーバイナリ
            rust-backend-pi = craneLib.buildPackage (commonArgs // {
              inherit cargoArtifacts;
              cargoExtraArgs = "--bin rust-backend";
            });

            # データ移行用バイナリ
            rust-backend-pi-import = craneLib.buildPackage (commonArgs // {
              inherit cargoArtifacts;
              cargoExtraArgs = "--bin import";
            });
          }
        );
      }
    );
}
