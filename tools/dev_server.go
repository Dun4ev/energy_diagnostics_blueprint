package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
)

func main() {
	port := flag.String("port", "8123", "port to listen on")
	flag.Parse()
	rootDir := filepath.Join(".", "docs", "animation", "rehearsal")

	http.HandleFunc("/save-video", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}
		filename := r.URL.Query().Get("file")
		if filename == "" {
			filename = "rehearsal_animation.webm"
		}
		outPath := filepath.Join(rootDir, filename)
		f, err := os.Create(outPath)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer f.Close()

		n, err := io.Copy(f, r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		log.Printf("Saved %d bytes to %s\n", n, outPath)
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","bytes":%d,"file":"%s"}`, n, filename)
	})

	fs := http.FileServer(http.Dir(rootDir))
	http.Handle("/", fs)

	fmt.Printf("Serving %s on http://0.0.0.0:%s\n", rootDir, *port)
	if err := http.ListenAndServe(":"+*port, nil); err != nil {
		log.Fatal(err)
	}
}
