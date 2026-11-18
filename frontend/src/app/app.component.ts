import { Component } from '@angular/core';
import { SeismicHudComponent } from './components/seismic-hud/seismic-hud.component';

@Component({
  selector: 'app-root',
  imports: [SeismicHudComponent],
  template: `
    <main>
      <app-seismic-hud />
    </main>
  `,
})
export class AppComponent {}
