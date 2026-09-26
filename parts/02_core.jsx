    const { useState, useEffect, useMemo, useRef, useCallback, useContext, createContext } = React;

    // =========================================================================================
    // CONFIG — bump APP_VERSION on EVERY deploy. It shows in the login footer.
    // =========================================================================================
    const APP_VERSION = 'v1.13.0';
    // The UNIFIED Home Vacation project — the same database and the same logins as HR, Maintenance and the CRM.
    const SUPABASE_URL = 'https://plwyzkqlbzcikmuurjqg.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_publishable_jdkL0GvmNoJGHnzadNAqgA_vuiFLthv';   // publishable key — safe here, RLS protects the data
    const tbl = (t) => 'ops_' + t;          // every HV Ops table is prefixed ops_ inside the shared database
    const HV_APPS = [
      ['HR & Payroll', 'https://home-vacation-hr.pages.dev', 'hr'], ['Maintenance', 'https://hv-maintenance-system.pages.dev', 'maint'],
      ['Property management (CRM)', 'https://property-management-crm.pages.dev', 'crm'],      // 3rd item = key in hv_my_systems()
    ];

    /* Shared Home Vacation brand assets — identical to HR / Maintenance / CRM. LOGO_LOCKUP = mark + wordmark, LOGO_MARK = the arch alone. */
    const LOGO_LOCKUP = 'data:image/webp;base64,UklGRhgaAABXRUJQVlA4WAoAAAAQAAAANgEAUgAAQUxQSJYOAAAB8IX8/67G9f89jxajiGCwJIRIkSDFacCBkMFWSMAy40EMzeCeYAh40LVvpDh4MH74jLtpISQbZ9w3qwyGodgbA5JWPkwYSCcIAQ/yATfp50aEbJh0aDqGjS2RqZUScmB3ngfrvd5rJfvOw4iYAFyoffN0AQPYOyT5eNAys3pE4fHMIGVsn7L7/oHJXZpNDkTsD/o0PDoW8WB88KH2aXis4pVdEXl3wKHs0Ph96P27Iu4PDTJCXRr+cB2AywXg6p6A3fHBxR0aN4aAV0vkfQC43tDx1D+o0Gj8IeAqUf/THADMtkmy6x9MFGj4chq4T+P9awCQpT40iMjSsALc/onSmy4Ar+yS5NTgYZHi81m4ajT9LgCoJE/HBw3jfVHDjndpZeM1AOPH5MnwgGGPwg+BGi2+B0DZJ3eVgcId6s9n8Rat33cB2OP+6iDBeaJ7OY57vMifrgFQ72gLA4RVkmwNocALvg1gPJQYHhgoxyR/GEaBF/4OAIz7BwYLJDmNe7yEtwFAGRh8SvJDhHgp38Ig8RnJIRxcju9cAOwDgjGSFbzLS7oJYME5GJgiuYiDy8LbQDE0GAiR58Ov8tI2gEZiMDBF9vHO5eFbeHl3MOAn+/bCJSqgvzoYGCf7Y7VLdIB+YTAw3OfLNw8uEV99ufn3oTjt/0xGJnyOvyun1+u8OHuXLyPfX6ZIa8eyhZODgITy+PSB0Vh259lJt9tubCwqBoFnJzfNJE53h3W3ioUHYq1wR5HYOnTJOZvbBpXWqJlopUeSh2teE+XWiMCRyee1R0VhQctpYQChit/Inan1SLKzFZeo1aSuNCu64T5f/uJSxRt7lrXJPYk7JG8J7BuUPU2Idsj+uFyIZBHAIuUfGNk6XJFbZs8piJIFuUiLZL/dIcmKQyZKFgRxmj0E0KRmsEyS/XanT7IXFQXJhzLTPNNN8fI1rBojeSyhkbyr857Q5KbggOSO3D7JXQCfmlg1QpEtuUOWIdwme24ZjexkfACUUIXs+CS2yZ5b54wlU8n5+UMyG0moqhoEcMhtUZU8VD0AMLHcI3OCEMm4RPiCvi+8E7p2+37tJyueXUTbRBaA8owkD+7OBKZmtS5JarpnJLkok6XBJslusbCxubmxsXkXkiFySSZOTgsC5BkzEsvkFowDHdaNAuQZszrDJBmAcZNVQYlcgWSVTOqCJM+8pvzW1O7+Yub6VTsA3G6YqljXJ08Ucw9IMgvDXZIMGbXtRuN9o09J3oGlNdZkqqxD+IilZR4aBcgqZD31NaN1lrNsScXlDrmli5IrkK6x5zZg3dQ4+TLyjYnN+AfVn38m2fniOoC57+SuLX5n1bA1zi7JVUg2SG4CONCxYPSYRkWSqjUJMmg0SaqCkTNGQMYNHpFeKdmRM0ZBLsmo5IRUWVdjE/J+Mivo5M+omRnrsx85kPrm1cDBzzT+6iqAJ3I3WxfRhqkFkid2mVmSXacRZ0SLFO5cjNLiI6N1tm2CLNtAhTWDFkuwOMuOgjJrMknSb8pHqiZQYVNApMiYCeWE/TelNvH2z5R/D0BJ5rUpy8b65Ili6gHJImSVNskZiX2B/VjmU5KL1mCFZ26Rq8c8hC2uAWEyJJggl6xqMQdMk9MSKTMVACrpMaOSfiBEOlBnzyNhV4BdvnyzIVHAezT9BYAnMv6GZST5YGYxkUgkZhfaosckk1LYIalK8K5Oo5nHwPCw027KS2ZEadIvSJBeAHWWBVEyYFGC9AGosyyRJn1SWwAe8hBmg2QcmCZH4OmxZrTK7sFm96ARqRlt4je08CPA9Z3E2IcXYjIL7JG8JVckmRV0C6fk6RgwRfK4IcXuSb9/yv0hE6iwKWpyC8I6KwCQIL26BPtui+qsAMAS6ZPymtpizZSHzBogRuYMuiT53ebLN42+wTgt/Q3wjtE1WG7RPslZuQLJVQHtGslNYI9kImGwoTNcMBMmo7ooGRWEybBOaTGnS/LMYU2YDOvQYt4oZUWVVVPuM64YQSOjomP22629c+01Gr6FqjV8Bdg3eO2S7ZG8JVckmTXAKcnQIskjLFjxbMgM6tzSbbEJYYVVCFPs2ACoPHNZU2EVwjQ7jovYZs3UaJ9ZCdTZGxEckdrQX/5y/xuDGq7S4t8B9wz2S42SYlGf5IIy7vf7x4eHG6IdkqrcDsmkaBx3aHjLxO7w+NRUwK/AdJL0A34yJfCR+ZHpYDA4kSKTAOZJryU+sjISCoVCniUybZAkPaZKPDQVIJeAkIGvz6rRHRdlb+Mjq46Bawb6kDXDfbINY02kkXwgd0Ry1gh7ok3gpsGnJFVY7egwD+TZcwnylG4CCJJhSzRKN2VGTWVJj5kYGQCCBlgiVyz5Hji2irPAdzJvXYBiKkHyQGqGZH9YIiA4HQZmpBKWQWMbaHMdekeHbFW2m9XyVodkFHCdMWuFs0OyXi5VW+16m5wXqeyPmAqRSTMaDyGFIun1WvAE12n5e8CmzJx1J+aGT0mqMjskH0MCq7okgBDJXQPVugA5HSIDghSZhWGS3AawzaYVaXLbBbGtxapFFQBosm7C2WHOBJqsL8l9vXnv9pwH3mr1iy+qX3Us+AK4L3P7EqFAkrNGGknOAnhmgD3yMUzdsQ7brNVYhbDJIiSXyAAQI1NyWhxAk2VIpslJI7dEU6SSKbl10mcmQHbYOyLvusj/Lf3hP375y0zuvxpflst//M9fzr3h9c/+7iu5KnBP5h1rxki2YW7ohCQ3Z4agjC00SHITcvZPNehnDDZI7t9Sk6qqqncSTlPzJLkgmCcnZFDlQwDbZEKmyiYwz/6IjLvHoiDJMwtQJSMyD8k8zCBJCt7HQb3y9Oj8/JyG5+fnf/0yE1SA8fcOLpWX5LEFmNKR/ZMuhXvQHxgZy8numcIheQhhlU1IJ3g2AlxpkrWoolNSPVIFqixCWmPfo1N55pJocUtga5KaTeBNt8ht6ENSKIl+e+PF+TktPT/MeQDMVo1KF+bskg2JVZIJHbwNnbEG4R55YpcbJ7kBIGviyFyGzAomyJScj1wGgEck+/VSqU7y0A8Eybicn8zqEjxzShwaAGWSh9vVeo8kcxAG5ZRD3fmDQ17k+Zc3AFz9qMOPgCcXhrvs35QYfsYdGN583Bb0Gw/GIJ4lVZhc5WkAgFJo7BnvN26Zc7Q7DsEImzC5xSUdRnMtCutRAPCybZNDgQmdn1VIJnvTBgiUW9T3tpdHIHZ0mpANsH5xJM8PMx5g/Crw2uaT//3666//98n9OVhtt0NWcUJ6bCoUCjgha7fDtNOOS6koENtsZhQHjD2ReHzaBfEVG8w6ILQpMmYdwfloANKKIgWbovvri0rul3M3gjfmljK5py/M6c+/XJqb8ysAMOQJ3lj65IZV/z4f8fwNOGBzud02iIfmPnlhTnx+dNRoHP14fn7OX/77xzeyPYp731ZzEQUAghVrpAcB6eeU72/PA8DQJ4MWkp00AAw9vZClgQR5lgSAGz8OXMhWEAA+GbyQJQCY+/Fy2dyCK17A6dK5RwHFK/DOx/0Ctxp36DyJUDjm0I16AI9HNBFb8Aq8TihuQSQaTATkJmMxt8CVSLhEtkjcZ8IVXfCI3NF4SOTyG7gVM75Y3CcYTcau6LyJYDhmE/hdgsml4HxY4JmPBy6EvQgA29NLNZ0T+HqTUDO6cAGIaILySiaoc2jptbjOn9ouJ1y69RpQrQhGt1IZv6CZQyAviK9Xs9NS/m01PapzF9PpoluQ2oqWw3LLlVh5UrBSUedFsZZDtDZpprycmdS5HqZyMV0gtV1OOHTKYUIQWalpMcG6lp7W/flveivIIgAs/R34mzkkBHjkRzalc2huCKNFQNEBmTiE6boL2yuCiRwMtbrDK8LkCuRDaxDnssDymiCjIvrIRAxJTRSFoboVs8iVd0AYKwBXdMByDML5iioA8l4Icz7giPzt62+88frrr4dTped/M8X2JIChp9aM2y8gksxPhkVZFXm/DqX0vEuHfDECM0vroQlNFXjKS1FFpyTWs7acwZqJQGl6UvAwAEw+FKQ1LC+bWEE+LVqPegUT6ck1i5RSct6hg/YoDDMrk+mAmYfZmPuI5Pdf/19t4/1ZLwB//rkJsggAN15YcX3sItSJtVhaEEl71yAsr6huAea3MiaU9LyaiKZdgkpqSYBl73oiY5F/OxMXrPuBiYIgVd4qwkSpugZRWfULUstY91mD0rLqFCix7bQJbwHZtJn1vDqqk/y/zBiA5HM5niUB4JcvzL3tv4hlrNSjAiS1hMChuSH5yCc3uoJSFSs+3UQOhjks1VWLQmsQF2JAXBNk5m0lxcS0r2gQhVgrx6txa1x5B4xtRY9crBovPzST8wEm9BvjgEvrypDtBADMNcz8aeoiVuClKkp3nAIU54M+3UR6ZKkEuUAOqSxy0zpvcXLaI3KjWbUqZxCp+nzbYUFWhVaSW4mhrAnWlv0BXbAIRIqCfGZ6QsrxKBLy6ibTbrUEufUIUAyZ0BKTfgvI7z8AsPBchuwsuwAMZZ7+KLMVssIbEfjCQDoimkxDrK6sRHWuzFreJ5qeEHgjABD265DOroUEEQeiKdFo2IQnYoColo9AOD2JkaRceAJ+VRDOZ1VBFLDFHbqolo9JQV1ZC+vc2bWcVxT262wxGxANCiIu0cLaSswSkltjQPi5DMmq6gKAoblMrvK08jSIjZtW/BttFVnzA5HnUiSb2pIPQtso8PnsQIKs+YHIczlh79tvv/2WDGDj1oCCrI0D4T+bEndHBhnk1jDg1brmaksADmYHGOTWMIDJ7Pbzrqhd1xacALDI0ECD3JqGXvFOBoMTbojf3uHAg/zhT287IXs1+fkpSc4OPPRHn//pg0wm86fP/7tLw8WBiKXJQU12UPNgUFMY1BT/rds1dXpy1DgahAQOuieN1Vu3FhcTi7OhgHdIAZzJwsbjnZ2d3d3dvb3Gs3a32+0eH+wU7iZmZ2dv3pyZuZV9/OyUN/+tA1ZQOCBcCwAAsCsAnQEqNwFTAD5tMJNGpCMhoSlVDJiADYlsbt61jflqa9v8r/XP3A9kqt/2/+zfrn109tnRHly+V/sX6N/Ln3zf8r2Gfn72A/1M/XzrG/2b0Af1P/KftJ7tn9p/Y33H/031AP61/pf//7N3/A///uB/5L/mewB+1nqzf9L9xfgo/sn/U/eT2tv//7AH/x9QD/89ZP1T/qv4J6eDutlOXPzQu5YKsvfpcTV7RTHbgVGMwx9mIFMwvFEODmbcUYCE0BX0Cui7DdgtXyVfJ2WWZ+YdKdXkJ4V2RlaenwasF+rlsm4/pXn2+x1AjV5LYDbqLw/clcebBBdZfnlz72+YFb9vLMRTp5Y0y872AVPcd2CUkVa1eM37sC6iwJ77N2wi2+HEU0pBfEULCfKV2m2ZrS3zdBcIfoEtzemVYMw2Idq4FB8leqJ/e71tHaHFGYNlxIHBVsYgAjvcP72lRIpjtwKjGYYkAAD+8EJ//9n6++k+ClFtPVCnVlhpAzkv339GzVFWydbqlLCuGhUwVBA28lalqeNwXKjZjCoGQ/BfUPjA6vFMDuAfIMkcUZcPMW0HeRzQl9lIOASDD9B3qcK2GUdI0fU1ppMChtg4yBp8My84NRJERCKlFLUc/1ZOB55fc//J0//8Q5//Ekv//iH5sIZz7f6HkJVABsH6jUU9RqKeo1FPUainqNRT1Gop6jUU9RrGm1Z2DlWXGw6kj8T2y39CT4AFJqgOttZBpqJB9B7mkMCeDyi4jJlZ3u+xYWFrqPuGl67RQwiVHjCznthd0BPr/Ejx0wqzTTWuGaLZ9EK25lCy8MUVDQYp8jxlJlS/r4zpfmrmZ4SH30VtP0+FC8xF4jiGJyAAiV9L/Gyq0yN0hKtQVKUeWYOopJj1x65U+yiPwadthJtuhQ4W3g8r4uj39286CR+C5AvzEsfoav5cxSX2DH+/L8JXem4KDJUzUgY+GRxBSWvrbZEqOs5WDXsa99gC/UWrZwN2cy7kohymxB5RfOsKkvm6/9JM///Nvp2og8pGuUv02t9uS/Jjex9UcQcr/5VTKFTLbUg4k51m7Yp1DFMvXPUIZJAbPiM1wHoghIpPn0UVvFsAiVhA1y9/UyifbxemFUFEAgeYhq1zz+3msDe7sl8oolWGy3UxjMltyHw5mNbBt9KfvGltEuk9SqsrszGgyMAFGQWfptlvOizBVQ8bKkO15ZMAwrLuKu4jB+CFhZ296/Hf/3zCrWSMhRetcS9oRoypXR9UJPcf52AktIhu/aLCDWyAoKq2M0LVg3BC7TfIVouoSfxPcQuZpPn+GBwRHUr8ZSvaLACTxzizQ0mux8/TBIKgsdmcX00oQzSoeJO4NEdNceid9PQ6KVPdjMGS3bWtI8TOiRE6h3P/IgALY8DfGZaTm/mvCcsv6UKxn/nIjHl1yGZH0/Zt0F7h6Kftu+xjPHV6sRFvf44HVCuZbTevaDBluRuzrmZoS6YxftDlCl+L7gKhcV8/03Kzi880N5DZlD2tBc/uP6H80D/AZGGSvs+zvJRxVyeJg/B28Q5mIYu4o8qqwunsAbBU2rP0HT8qRKfaXLvlJa2r32a3CeBRVtxD0SIrPJpOrIe1Sj+JEwbubiSnqPeJ/MbRPkejiE64f/sB4IIhS9F4AyjtpO3/YFCs8KEaWtm7j72Ge+e0RGFchoFIPTb+aRXg3O9qNwFTlx0XRMlEjuB8S8PykssiYXqP6F0qFk9LA/NoYZegSu2RQI3tks7X8TEqaT9bLoOTMNbr3sm5xZsQVZwDFU+1V3bNniuFeC/VxjMONvo8kjbcKbZKw+YtbuD+hdBu8MHNxp5nWSlrO8no2YX9sgPfY6ESzzi5In7Ec5AvW1d5bQlPHcYwMyzmTNsJp/DddYCfof16LDimmsmXJgyekYsCwKaf+N2/0q153ERvQbGRc6gGf3e1F5qFdjBytC1ysv4E7r6htQCKyqPehr+VDehJVf8hDZMnsiIEaFAZ/fJvE3aFfpyCtFlbySF4ADgcOQ/BbBVAQZNYJRqri4/UeZxRjZOadg/ns4jjJrV+4d5PmbjkzRfT/xHzrxQbA1dZUh5+8VF9fBdSZfuk6U1ygvjuE41v/EUU48yZ6EU1E0x9d5OdSipsIgt00P64UOzEVUYtGUMv5YMWMZToGB3zoeRXehV0npGKE89CDCVi+2gm83d6si4kRZ/yyzbBBjzB57g84EjIt0Awk0Aoot5lP+kOsoUBX7udwhLHe0VZB0yIcVsGzKzmi9aQJuMO+qemgQm2tbF3aPyCcX/muzJf0Wvhnfm0v9u8Sj/F+nznMd/HO7Ko10TxFDGpwn7ufGmWrEOcDQE6Cp5rPmeP1YntuoJNP6sbL2BeZZAqTMG2GpKdy+IUchnJ35oiil9sYoTgdHoM4GqvsWqGMp4+WhKcOb4ZD3WflDAphJD0ndiM1/avC4Dk9MJG1V3ii5h10H0LACUQE6DfZb2WuK1XCv48yVnYe8VfFCzDZZZr6wKI5OowB1ntwY+TjJsHue3CNoPQUIYBeIjVVmha4fD7E8v78OJtMFVXPO1YUo9Uoi0OxLZopR/ScvFO2uxqThswBbOXkwQBEadU2hahjsenxdjwAWbMiW4q/XX4Uw/kZb1S6if3wq0PPrKEd9V5dEoqLSymY6pNbl4M/a87a3AXtgdUE3vhPSOfSRZutw4I92esriqO5O63UfarDYZxzJg0vuZ7hTjuEnf7DyvRCoLRvohsSzZYxg7YV9cPrxF+r8zus/O2TfmQ6MIrrkLzth36Yx6LdsYimIKzJt+ae07YywQUJwYW9On+KZ9A/Oasvxs4jni7DQw5Z2uH0+i08DJ+Wk+nuPm75naA+8MCs7PB+KYcEriNehb1Pvs3d6oTA+sYV75z71sb+Sge/Z+O//YhPFvk5gw25VVtSfsbMiqk+aw6UMLW6bitwg9ju1NkKY5qPiD85DOKtaEjTctSsXwmoI+YG2Xdzt88UVpxZd8zdiIGCuz8+vXh0a2Wwa/M3wRqkHzivyHRq9szlD+JeDjqAroK2B3qNEMBLYASsLFll9sDORhYOQHeLHRiGh+AMFWwtiluT8Q+9aVDl1oBpPtKPmiskWW7X9QX37+AhURO9uysozaM7U/Mt6cZdTFQU3OMNNiNhOqWq/7+vr3VBWkP9pt0rfnm8POargYWK+GXLyw/g2ZeP5FhBfvlKvP065ExQtfHAz/uGTuvdoJpdagN6+Y0fn5YZukjv+rV5UcrKxp2jFM6IwT6S5vs37ail7xgouuxfir4P1xoNTEcE/zqr5126fRMK2JqmTTrUCdv8SLrOg/kGz1ZPF+FLNVO30/jG9vn3taQgb8aorqE45xXKCVw9GX7R5NAlT1t2VaKerOCuCeeSOykSEaBIwpQof+952pTACZYfdCECpH9FHxBkbALjziiQXHWIyRa0l1HSCY22kDPBpWhartiCXWnbHLJj4X/pyHdN6l0huPyAVlym1LONLai3G4lwkMevu+66hmO3Y4Q7iAredKNx0sjygYs0jGyeLiwEnf/P+BHqgMVYEv5IwjKlkPU4LWo7Xwexdnk0kdRWkXktXjSbQ23FvrfZsuy3xW0aeyIWh60q2+R7KKXJBS/uNcWHBlGPihh9J1OOnAfpXEVZxxhw9gqu4DM6WR5QGUwz4z7PWexakPYuNlNNaoXtPbWDbjTnkIKvBIp79HKLpOxMHGXp6Om3kfCVyJ8LU5qSz2UmqE7hYNqtuAwXcG7Re7qAmt6QrGpyJ4CPBoeV9fHdm37fcKn68Mk/sz46Zr7jasQ4fHSyPKBlhkTLAErAzuWvb8lD54yZK/kMIar10cQDFVqGd3AGRXym0CXvRbTjhzzABEAAAAAAAAAAAAAAA==';
    const LOGO_MARK = 'data:image/png;base64,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';
    document.querySelector('link[rel="icon"]').setAttribute('href', LOGO_MARK);

    const hasBuiltInConfig = /^https:\/\//.test(SUPABASE_URL);
    let sbc = null;
    const initSupabase = () => {
      let url = hasBuiltInConfig ? SUPABASE_URL : null, key = hasBuiltInConfig ? SUPABASE_ANON_KEY : null;
      try { url = url || localStorage.getItem('hvops_sb_url'); key = key || localStorage.getItem('hvops_sb_key'); } catch (e) {}
      if (url && key) sbc = supabase.createClient(url, key);
      return !!sbc;
    };

    // =========================================================================================
    // HELPERS
    // =========================================================================================
    const pad = (n) => String(n).padStart(2, '0');
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const toLocalInput = (d) => { if (!d) return ''; const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };
    const fromLocalInput = (s) => s ? new Date(s).toISOString() : null;
    const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
    const monthStart = (d = new Date()) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-01`; };
    const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); return monthStart(new Date(y, m - 1 + n, 1)); };
    const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
    const monthRange = (ym) => { const [y, m] = ym.split('-').map(Number); return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }; };
    const inRange = (d, r) => { if (!d) return false; const t = new Date(d).getTime(); return t >= r.from.getTime() && t < r.to.getTime(); };
    const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    const pct = (a, b) => b ? Math.round((1000 * a) / b) / 10 : null;
    const r1 = (n) => n == null || isNaN(n) ? null : Math.round(n * 10) / 10;
    const show = (v, unit = '') => v == null || v === '' ? '—' : `${typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : v}${unit}`;
    const money = (v, cur) => v == null || v === '' ? '—' : `${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${cur || ''}`.trim();   // never converted
    const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const fmtHours = (h) => { if (h == null) return '—'; const m = Math.round(Math.abs(h) * 60); return m >= 2880 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
    const friendlyError = (e) => {
      const m = (e && e.message) || String(e);
      if (e && e.code === 'PGRST116') return 'You do not have permission to change this record.';
      if (/row-level security/i.test(m)) return 'You do not have permission for this action.';
      if (/duplicate key/i.test(m)) return 'This already exists (duplicate).';
      return m;
    };

    const ROLE_LABEL = { admin: 'Admin', manager: 'Marketing manager', data_entry: 'Data entry', marketing: 'Marketing' };
    const isMgr = (me) => me && (me.role === 'admin' || me.role === 'manager');
    const LISTING_STATUS = {
      draft: ['Draft', 'bg-slate-100 text-slate-700'], ready_to_publish: ['Ready to publish', 'bg-sky-100 text-sky-800'],
      published_claimed: ['Published (claimed)', 'bg-indigo-100 text-indigo-800'], verified_live: ['Verified live', 'bg-emerald-100 text-emerald-800'],
      on_hold: ['On hold', 'bg-amber-100 text-amber-800'], rejected: ['Rejected', 'bg-rose-100 text-rose-800'], archived: ['Archived', 'bg-slate-200 text-slate-500'],
    };
    /* Where a record lives: the working list holds only what still needs work; anything published moves to its own tab. */
    const BUCKETS = { work: ['draft', 'ready_to_publish', 'on_hold'], published: ['published_claimed', 'verified_live'], closed: ['rejected', 'archived'] };
    const bucketOf = (status) => BUCKETS.published.includes(status) ? 'published' : BUCKETS.closed.includes(status) ? 'closed' : 'work';
    const publishedAt = (r) => r.date_published_verified || r.date_published_claimed;
    const bucketTabs = (rows, word) => [['work', `In progress (${rows.filter((r) => bucketOf(r.status) === 'work').length})`], ['published', `Published (${rows.filter((r) => bucketOf(r.status) === 'published').length})`], ['closed', `Rejected / archived (${rows.filter((r) => bucketOf(r.status) === 'closed').length})`]];
    const SOURCE_TYPES = ['sales_agent', 'owner', 'developer', 'whatsapp', 'walk_in', 'other'];
    const CHANNEL_STATUSES = ['not_started', 'in_progress', 'published', 'rejected'];
    const TASK_COLS = [['todo', 'To do'], ['doing', 'Doing'], ['review', 'Review'], ['done', 'Done']];
    const PRIORITY = { low: 'bg-slate-100 text-slate-600', normal: 'bg-sky-100 text-sky-700', high: 'bg-amber-100 text-amber-800', urgent: 'bg-rose-100 text-rose-700' };
    const DELIV_STATUS = { planned: 'bg-slate-100 text-slate-700', submitted: 'bg-sky-100 text-sky-800', approved: 'bg-emerald-100 text-emerald-800', revision_requested: 'bg-amber-100 text-amber-800', late: 'bg-rose-100 text-rose-700', missed: 'bg-rose-200 text-rose-900' };
    const SLA_STYLE = {
      green: { chip: 'bg-emerald-100 text-emerald-800 border-emerald-200', bar: 'border-l-emerald-500', dot: 'bg-emerald-500', label: 'On track' },
      yellow: { chip: 'bg-amber-100 text-amber-900 border-amber-200', bar: 'border-l-amber-500', dot: 'bg-amber-500', label: 'At risk' },
      red: { chip: 'bg-rose-100 text-rose-800 border-rose-200', bar: 'border-l-rose-600', dot: 'bg-rose-600', label: 'Breached' },
      none: { chip: 'bg-slate-100 text-slate-500 border-slate-200', bar: 'border-l-slate-300', dot: 'bg-slate-300', label: '—' },
    };

    // The 22 required fields + the rest of the form. type: text | num | bool | select | multi | area
    const FIELD_LABEL = {
      title: 'Title', location: 'Location', property_type: 'Property type', deal_type: 'Sale / Rent', area_sqm: 'Area (sqm)',
      building_levels: 'Building levels', floor: 'Floor', bedrooms: 'Bedrooms', bathrooms: 'Bathrooms', balconies: 'Balconies',
      furnished: 'Furnished', media_images_count: 'Images (count)', media_videos_count: 'Videos (count)', media_drive_link: 'Media drive link', media_uploaded: 'Photos ready (approved by manager)', media_has_logo: 'Photos have the logo', media_edited: 'Photos edited', owner_name: 'Owner name', owner_phone: 'Owner phone',
      is_exclusive: 'Exclusive', view_type: 'View', price: 'Price', currency: 'Currency', facilities: 'Facilities', selling_points: 'Selling points',
      buyer_persona_nationality: 'Buyer persona — nationality', buyer_persona_age_range: 'Buyer persona — age range', buyer_persona_gender: 'Buyer persona — gender',
      cover_photo_belongs: 'Cover photo belongs to this unit', date_received: 'Date received (SLA start)', source_type: 'Source type',
      source_name: 'Source name (who gave it)', source_contact: 'Source contact', assigned_to: 'Uploader (puts it online)',
    };
    const POSITIVE_FIELDS = ['media_images_count', 'media_videos_count', 'area_sqm', 'price'];

    // Mirrors fn_calc_completeness() so the meter is live while typing. The database value is the one that counts.
    function calcCompleteness(row, required) {
      const req = (required || []).filter((f) => f in FIELD_LABEL);
      const missing = req.filter((f) => {
        const v = row[f];
        if (v == null) return true;
        if (typeof v === 'string' && v.trim() === '') return true;
        if (Array.isArray(v) && v.length === 0) return true;
        if (POSITIVE_FIELDS.includes(f) && !(Number(v) > 0)) return true;
        if (f === 'media_uploaded' && v !== true) return true;          // complete only when the photos ARE uploaded
        return false;
      });
      return { pct: req.length ? Math.floor((100 * (req.length - missing.length)) / req.length) : 100, missing };
    }

    // Mirrors vw_listing_sla. Clock: date_received -> verified on the website, minus on_hold time.
    function slaOf(l, slaCfg, now = Date.now()) {
      const warn = Number((slaCfg && slaCfg.warn) || 48), breach = Number((slaCfg && slaCfg.breach) || 72), grace = Number((slaCfg && slaCfg.claim_grace) || 24);
      const verified = !!l.date_published_verified;
      const end = verified ? new Date(l.date_published_verified).getTime() : now;
      let paused = (l.paused_seconds || 0) * 1000;
      const onHold = l.status === 'on_hold' && !verified;
      if (onHold && l.hold_started_at) paused += now - new Date(l.hold_started_at).getTime();
      const hours = Math.max(0, (end - new Date(l.date_received).getTime() - paused) / 36e5);
      const state = ['rejected', 'archived'].includes(l.status) ? 'none' : hours < warn ? 'green' : hours <= breach ? 'yellow' : 'red';
      const claimedNotFound = l.status === 'published_claimed' && !verified && l.date_published_claimed
        && now - new Date(l.date_published_claimed).getTime() > grace * 36e5;
      return { hours, state, verified, onHold, remaining: breach - hours, onTime: verified && hours <= breach, claimedNotFound, breach, warn };
    }

    // ---------- CSV
    function parseCSV(text) {
      const rows = []; let row = [], cur = '', q = false;
      text = text.replace(/^﻿/, '');
      const sep = (text.split('\n')[0] || '').includes(',') ? ',' : ';';     // Excel in some locales exports ';'
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === sep) { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c !== '\r') cur += c;
      }
      if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
      return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
    }
    function downloadCSV(filename, headers, rows) {
      const esc = (v) => { const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    }

    // =========================================================================================
    // UI ATOMS
    // =========================================================================================
    const ICONS = {
      home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
      tasks: 'M9 11l3 3 8-8M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10', bell: 'M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9zm4 11a2 2 0 0 0 4 0',
      agency: 'M4 20V6l8-3v17M12 9l8 2v9M2 20h20M8 9h.01M8 13h.01M8 17h.01M16 14h.01M16 17h.01', chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
      report: 'M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6', cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm8 3l2-1.5-2-3.5-2.4.8a7 7 0 0 0-1.6-.9L15.5 4h-4l-.5 2.4a7 7 0 0 0-1.6.9L7 6.5 5 10l2 1.5a7 7 0 0 0 0 1L5 14l2 3.5 2.4-.8c.5.4 1 .7 1.6.9l.5 2.4h4l.5-2.4c.6-.2 1.1-.5 1.6-.9l2.4.8 2-3.5-2-1.5a7 7 0 0 0 0-1z',
      more: 'M5 12h.01M12 12h.01M19 12h.01', project: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01', camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z', spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z', plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', copy: 'M9 9h10v11H9zM5 15V4h10', logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
      check: 'M5 12l5 5 9-10', back: 'M15 5l-7 7 7 7', upload: 'M12 16V4M7 9l5-5 5 5M4 20h16', print: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z', link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    };
    const Icon = ({ name, className = 'w-5 h-5' }) => (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS[name] || ''} /></svg>
    );
    const Badge = ({ className = 'bg-slate-100 text-slate-700', children }) => <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}>{children}</span>;
    const Btn = ({ kind = 'primary', className = '', ...p }) => {
      const k = { primary: 'bg-brand-700 text-white hover:bg-brand-800', ghost: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50', danger: 'bg-rose-600 text-white hover:bg-rose-700', ok: 'bg-emerald-600 text-white hover:bg-emerald-700', soft: 'bg-brand-50 text-brand-800 hover:bg-brand-100' }[kind];
      return <button type="button" {...p} className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${k} ${className}`} />;
    };
    const Card = ({ className = '', children, ...p }) => <div {...p} className={`print-card bg-white rounded-xl border border-slate-200 shadow-sm ${className}`}>{children}</div>;
    const inputCls = (bad) => `w-full rounded-lg border px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 ${bad ? 'border-rose-500 ring-1 ring-rose-300' : 'border-slate-300'}`;
    const Field = ({ label, bad, hint, children, className = '' }) => (
      <label className={`block ${className}`}>
        <span className={`mb-1 flex items-center gap-1.5 text-xs font-medium ${bad ? 'text-rose-700' : 'text-slate-600'}`}>{label}{bad && <span className="rounded bg-rose-600 px-1 text-[10px] text-white">required</span>}</span>
        {children}
        {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      </label>
    );
    const Select = ({ value, onChange, options, placeholder = 'Select…', bad, disabled }) => (
      <select className={inputCls(bad)} value={value == null ? '' : value} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>)}
      </select>
    );
    const TriState = ({ value, onChange, bad }) => (
      <div className={`flex rounded-lg border overflow-hidden ${bad ? 'border-rose-500 ring-1 ring-rose-300' : 'border-slate-300'}`}>
        {[[true, 'Yes'], [false, 'No']].map(([v, l]) => (
          <button type="button" key={l} onClick={() => onChange(value === v ? null : v)} className={`flex-1 py-2 text-sm ${value === v ? 'bg-brand-700 text-white' : 'bg-white text-slate-700'}`}>{l}</button>
        ))}
      </div>
    );
    const Modal = ({ title, onClose, children, wide, footer }) => (
      <div className="no-print fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={`flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">{children}</div>
          {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</div>}
        </div>
      </div>
    );
    const PageHeader = ({ title, sub, children }) => (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="text-xl font-bold text-slate-900">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>
        <div className="no-print flex flex-wrap items-center gap-2">{children}</div>
      </div>
    );
    const Empty = ({ children }) => <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
    const Meter = ({ value, className = '' }) => (
      <div className={`h-2 w-full overflow-hidden rounded-full bg-slate-200 ${className}`}>
        <div className={`h-full rounded-full ${value >= 100 ? 'bg-emerald-500' : value >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
      </div>
    );
    const Tile = ({ label, value, target, better = 'high', tone, onClick }) => {
      let ok = null;
      if (target != null && value != null && typeof value === 'number') ok = better === 'low' ? value <= target : value >= target;
      return (
        <Card className={`p-3 ${onClick ? 'cursor-pointer hover:border-brand-500' : ''} ${tone === 'red' ? 'border-rose-300 bg-rose-50' : ''}`} onClick={onClick}>
          <div className="text-xs text-slate-500">{label}</div>
          <div className={`num mt-1 text-2xl font-bold ${tone === 'red' ? 'text-rose-700' : 'text-slate-900'}`}>{typeof value === 'number' ? show(value) : value == null ? '—' : value}</div>
          {target != null && <div className={`mt-0.5 text-xs ${ok == null ? 'text-slate-500' : ok ? 'text-emerald-700' : 'text-rose-700'}`}>Target {show(Number(target))}{ok == null ? '' : ok ? ' ✓' : ' ✗'}</div>}
        </Card>
      );
    };
    const Tabs = ({ tabs, value, onChange }) => (
      <div className="no-print scroll-x mb-4 flex gap-1 border-b border-slate-200">
        {tabs.map(([k, l, n]) => (
          <button key={k} onClick={() => onChange(k)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${value === k ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {l}{n ? <span className="ml-1.5 rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{n}</span> : null}
          </button>
        ))}
      </div>
    );
    const MonthPicker = ({ value, onChange }) => (
      <div className="no-print inline-flex items-center rounded-lg border border-slate-300 bg-white">
        <button className="px-2.5 py-2 text-slate-600" onClick={() => onChange(addMonths(value, -1))} aria-label="Previous month">‹</button>
        <span className="min-w-[8.5rem] text-center text-sm font-medium">{monthLabel(value)}</span>
        <button className="px-2.5 py-2 text-slate-600" onClick={() => onChange(addMonths(value, 1))} aria-label="Next month">›</button>
      </div>
    );
    const SlaChip = ({ listing, slaCfg }) => {
      const { cfg, now } = useApp();
      const s = slaOf(listing, slaCfg || cfg.sla_hours, now);      // projects pass their own, longer SLA
      if (s.state === 'none') return null;
      const st = SLA_STYLE[s.state];
      const text = s.verified ? `Live in ${fmtHours(s.hours)}` : s.onHold ? `Paused · ${fmtHours(s.hours)}` : s.remaining >= 0 ? `${fmtHours(s.remaining)} left` : `${fmtHours(-s.remaining)} over`;
      return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${st.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{text}</span>;
    };
    const StatusBadge = ({ status }) => { const s = LISTING_STATUS[status] || [status, '']; return <Badge className={s[1]}>{s[0]}</Badge>; };
    // Single-series bar chart. Values are labelled directly so no axis is needed.
    const Bars = ({ rows, unit = '' }) => {
      const max = Math.max(1, ...rows.map((r) => r.value || 0));
      return (
        <div className="flex h-36 items-end gap-2">
          {rows.map((r) => (
            <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="num text-[11px] font-medium text-slate-700">{r.value == null ? '—' : show(r.value, unit)}</span>
              <div className="w-full max-w-[44px] rounded-t bg-brand-500" style={{ height: `${Math.max(2, (100 * (r.value || 0)) / max)}px` }} />
              <span className="w-full truncate text-center text-[11px] text-slate-500">{r.label}</span>
            </div>
          ))}
        </div>
      );
    };

    const AppCtx = createContext(null);
    const useApp = () => useContext(AppCtx);
