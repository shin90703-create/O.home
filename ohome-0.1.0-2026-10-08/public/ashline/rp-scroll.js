(() => {
  const renderGame = render;
  render = function() {
    const previous = document.getElementById('roleThread');
    const top = previous?.scrollTop ?? 0;
    const atEnd = !previous || previous.scrollHeight - previous.clientHeight - top <= 8;
    renderGame();
    const thread = document.getElementById('roleThread');
    if (!thread || thread === previous) return;

    const follow = atEnd || previous.dataset.roomId !== thread.dataset.roomId;
    thread.scrollTop = follow ? thread.scrollHeight : top;
    if (follow) {
      const initialTop = thread.scrollTop;
      requestAnimationFrame(() => {
        if (thread.isConnected && thread.scrollTop === initialTop) thread.scrollTop = thread.scrollHeight;
      });
    }
  };
})();
